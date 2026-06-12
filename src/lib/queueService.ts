/**
 * Live queue operations — Supabase is the source of truth.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type {
  Patient,
  ServicePoint,
  ServiceType,
  PatientPriority,
  PriorityReason,
  PatientChannel,
  PatientStatus,
  ServicePointStatus,
} from './queueEngine';
import type { PatientRow } from './database.types';
import { deriveCareStatus } from './patientStatus';
import {
  buildTemplateUserMessage,
  formatServiceLabel,
  type UserMessageType,
} from './aiMessageTemplates';
import { normalizeUgandaPhone } from './validation';
import { requestOpenRouterChat } from './openrouter';
import {
  loadPatients,
  loadServicePoints,
  loadMaxTicketNumber,
  rowToServicePoint,
} from './queueSupabaseSync';

const DEFAULT_SERVICE_TIMES: Record<ServiceType, number> = {
  'opd-triage': 180,
  consultation: 600,
  pharmacy: 120,
  laboratory: 300,
  cashier: 90,
};

const SERVICE_TYPES: ServiceType[] = [
  'opd-triage',
  'consultation',
  'pharmacy',
  'laboratory',
  'cashier',
];

export interface JoinPatientInput {
  name: string;
  telephone: string;
  visitReason: string;
  serviceType: ServiceType;
  priority: PatientPriority;
  priorityReason?: PriorityReason;
  channel: PatientChannel;
}

export class QueueServiceError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
  }
}

export function rowToPatientLive(r: PatientRow): Patient {
  const toSec = (iso: string | null | undefined) =>
    iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;

  return {
    id: r.id,
    name: r.name,
    phone: normalizeUgandaPhone(r.phone),
    telephone: normalizeUgandaPhone(r.telephone ?? r.phone),
    visitReason: r.visit_reason ?? undefined,
    ticketNumber: r.ticket_number,
    priority: r.priority,
    priorityReason: r.priority_reason as PriorityReason | undefined,
    careStatus: r.care_status ?? 'normal',
    status: r.status,
    serviceType: r.service_type,
    joinedAt: toSec(r.joined_at) ?? r.sim_joined_at_sec ?? 0,
    servedAt: toSec(r.served_at) ?? r.sim_served_at_sec ?? undefined,
    completedAt: toSec(r.completed_at) ?? r.sim_completed_at_sec ?? undefined,
    estimatedWait: r.estimated_wait_sec,
    queuePosition: r.queue_position,
    channel: r.channel,
  };
}

export async function loadLiveState(): Promise<{
  patients: Patient[];
  servicePoints: ServicePoint[];
}> {
  const [rows, spRows] = await Promise.all([loadPatients(), loadServicePoints()]);
  const patients = rows.map(rowToPatientLive);
  const byId = new Map(patients.map((p) => [p.id, p]));
  const servicePoints = spRows.map((r) =>
    rowToServicePoint(r, r.current_patient_id ? byId.get(r.current_patient_id) : undefined)
  );
  return { patients, servicePoints };
}

function getWaitingQueue(patients: Patient[], serviceType: ServiceType): Patient[] {
  return patients
    .filter((p) => p.serviceType === serviceType && p.status === 'waiting')
    .sort((a, b) => {
      const order: Record<PatientPriority, number> = { urgent: 0, high: 1, normal: 2 };
      const pa = order[a.priority];
      const pb = order[b.priority];
      if (pa !== pb) return pa - pb;
      return a.joinedAt - b.joinedAt;
    });
}

function computePositions(
  patients: Patient[],
  servicePoints: ServicePoint[],
  serviceType: ServiceType
): Map<string, { queuePosition: number; estimatedWait: number }> {
  const queue = getWaitingQueue(patients, serviceType);
  const activePoints = servicePoints.filter(
    (sp) => sp.type === serviceType && sp.status === 'active'
  );
  const numActive = Math.max(activePoints.length, 1);
  const avgTime =
    activePoints.length > 0
      ? activePoints.reduce((sum, sp) => sum + sp.avgServiceTime, 0) / activePoints.length
      : DEFAULT_SERVICE_TIMES[serviceType];

  const updates = new Map<string, { queuePosition: number; estimatedWait: number }>();
  queue.forEach((patient, index) => {
    updates.set(patient.id, {
      queuePosition: index + 1,
      estimatedWait: Math.round(((index + 1) / numActive) * avgTime),
    });
  });
  return updates;
}

async function persistPositionUpdates(
  updates: Map<string, { queuePosition: number; estimatedWait: number }>
): Promise<void> {
  const now = new Date().toISOString();
  for (const [id, { queuePosition, estimatedWait }] of Array.from(updates.entries())) {
    await supabase
      .from('patients')
      .update({
        queue_position: queuePosition,
        estimated_wait_sec: estimatedWait,
        updated_at: now,
      })
      .eq('id', id);
  }
}

async function recalculateAllQueues(
  patients: Patient[],
  servicePoints: ServicePoint[]
): Promise<void> {
  for (const st of SERVICE_TYPES) {
    const updates = computePositions(patients, servicePoints, st);
    await persistPositionUpdates(updates);
    for (const [id, pos] of Array.from(updates.entries())) {
      const p = patients.find((x) => x.id === id);
      if (p) {
        p.queuePosition = pos.queuePosition;
        p.estimatedWait = pos.estimatedWait;
      }
    }
  }
}

async function nextTicketNumber(): Promise<string> {
  const max = await loadMaxTicketNumber();
  return `QF-${String(max + 1).padStart(3, '0')}`;
}

async function notifyPatient(
  type: UserMessageType,
  patient: Patient,
  origin?: string
): Promise<string> {
  const fallback = buildTemplateUserMessage(type, {
    ticketNumber: patient.ticketNumber,
    serviceType: patient.serviceType,
    queuePosition: patient.queuePosition,
    estimatedWaitMin: Math.max(1, Math.round(patient.estimatedWait / 60)),
  });

  const prompts: Record<UserMessageType, string> = {
    join: `Generate ONE short SMS for a patient who joined queue. Ticket: ${patient.ticketNumber}. Service: ${formatServiceLabel(patient.serviceType)}. Position: ${patient.queuePosition}. Wait: ${Math.max(1, Math.round(patient.estimatedWait / 60))} min. Sign off QFlow / Mukono Health Centre IV.`,
    turn_approaching: `Generate ONE short SMS warning turn is approaching. Ticket: ${patient.ticketNumber}. Position: ${patient.queuePosition}. Sign off QFlow.`,
    turn_next: `Generate ONE short SMS telling patient it is their turn. Ticket: ${patient.ticketNumber}. Service: ${formatServiceLabel(patient.serviceType)}. Sign off QFlow.`,
    completed: `Generate ONE short thank-you SMS. Ticket: ${patient.ticketNumber}. Sign off QFlow.`,
  };

  const ai = await requestOpenRouterChat(
    [{ role: 'user', content: prompts[type] }],
    origin
  );
  return ai ?? fallback;
}

async function insertEvent(
  type: 'join' | 'serve' | 'complete' | 'alert',
  patientId: string,
  message: string,
  servicePointId?: string | null
): Promise<void> {
  await supabase.from('queue_events').insert({
    type,
    patient_id: patientId,
    service_point_id: servicePointId ?? null,
    message,
    sim_time_sec: null,
  });
}

async function insertNotif(
  type: 'joined' | 'turn_next' | 'turn_approaching' | 'completed',
  message: string,
  patientId: string,
  ticketNumber: string
): Promise<void> {
  await supabase.from('notifications').insert({
    type,
    message,
    patient_id: patientId,
    ticket_number: ticketNumber,
  });
}

function assertConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new QueueServiceError('Supabase is not configured', 503);
  }
}

export async function joinPatient(
  input: JoinPatientInput,
  origin?: string
): Promise<Patient> {
  assertConfigured();

  const ticketNumber = await nextTicketNumber();
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const careStatus = deriveCareStatus(input.priority, input.priorityReason);

  const telephone = normalizeUgandaPhone(input.telephone);
  const row = {
    id: ticketNumber,
    name: input.name.trim(),
    phone: telephone,
    telephone,
    visit_reason: input.visitReason.trim(),
    ticket_number: ticketNumber,
    priority: input.priority,
    priority_reason: input.priorityReason ?? null,
    care_status: careStatus,
    status: 'waiting' as PatientStatus,
    service_type: input.serviceType,
    service_point_id: null,
    joined_at: now.toISOString(),
    served_at: null,
    completed_at: null,
    estimated_wait_sec: 0,
    queue_position: 0,
    channel: input.channel,
    sim_joined_at_sec: nowSec,
    sim_served_at_sec: null,
    sim_completed_at_sec: null,
    updated_at: now.toISOString(),
  };

  const { error } = await supabase.from('patients').insert(row);
  if (error) throw new QueueServiceError(error.message, 500);

  const { patients, servicePoints } = await loadLiveState();
  await recalculateAllQueues(patients, servicePoints);

  const patient = patients.find((p) => p.id === ticketNumber);
  if (!patient) throw new QueueServiceError('Patient not found after insert', 500);

  const refreshed = (await loadLiveState()).patients.find((p) => p.id === ticketNumber)!;
  const eventMsg = `Patient ${ticketNumber} joined ${formatServiceLabel(input.serviceType)} via ${input.channel}`;
  await insertEvent('join', ticketNumber, eventMsg);
  const msg = await notifyPatient('join', refreshed, origin);
  await insertNotif('joined', msg, ticketNumber, ticketNumber);

  return refreshed;
}

export async function serveNext(
  servicePointId: string,
  origin?: string
): Promise<Patient | null> {
  assertConfigured();

  const { patients, servicePoints } = await loadLiveState();
  const sp = servicePoints.find((s) => s.id === servicePointId);
  if (!sp || sp.status !== 'active' || sp.currentPatient) return null;

  const queue = getWaitingQueue(patients, sp.type);
  if (queue.length === 0) return null;

  const patient = queue[0];
  const now = new Date().toISOString();
  const nowSec = Math.floor(Date.now() / 1000);

  await supabase
    .from('patients')
    .update({
      status: 'serving',
      served_at: now,
      sim_served_at_sec: nowSec,
      service_point_id: servicePointId,
      updated_at: now,
    })
    .eq('id', patient.id);

  await supabase
    .from('service_points')
    .update({ current_patient_id: patient.id, updated_at: now })
    .eq('id', servicePointId);

  const updated = await loadLiveState();
  await recalculateAllQueues(updated.patients, updated.servicePoints);

  const refreshed = (await loadLiveState()).patients.find((p) => p.id === patient.id)!;
  const eventMsg = `Patient ${patient.ticketNumber} called to ${formatServiceLabel(sp.type)}`;
  await insertEvent('serve', patient.id, eventMsg, servicePointId);
  const msg = await notifyPatient('turn_next', refreshed, origin);
  await insertNotif('turn_next', msg, patient.id, patient.ticketNumber);

  return refreshed;
}

export async function completePatientById(
  patientId: string,
  origin?: string
): Promise<Patient | null> {
  assertConfigured();

  const spId = await resolveServicePointIdForPatient(patientId);
  if (spId) return completeService(spId, origin);

  const { patients } = await loadLiveState();
  const patient = patients.find((p) => p.id === patientId);
  if (!patient || patient.status !== 'serving') return null;

  const now = new Date();
  const nowIso = now.toISOString();
  const nowSec = Math.floor(now.getTime() / 1000);

  await supabase
    .from('patients')
    .update({
      status: 'completed',
      completed_at: nowIso,
      sim_completed_at_sec: nowSec,
      service_point_id: null,
      updated_at: nowIso,
    })
    .eq('id', patientId);

  await supabase
    .from('service_points')
    .update({ current_patient_id: null, updated_at: nowIso })
    .eq('current_patient_id', patientId);

  const worked = Math.max(0, nowSec - patient.joinedAt);
  await supabase.from('patient_service_history').upsert(
    {
      patient_id: patient.id,
      ticket_number: patient.ticketNumber,
      patient_name: patient.name?.trim() || null,
      service_type: patient.serviceType,
      channel: patient.channel,
      joined_sim_sec: patient.joinedAt,
      served_sim_sec: patient.servedAt ?? null,
      completed_sim_sec: nowSec,
      worked_duration_sec: worked,
    },
    { onConflict: 'patient_id' }
  );

  const updated = await loadLiveState();
  await recalculateAllQueues(updated.patients, updated.servicePoints);

  const refreshed = { ...patient, status: 'completed' as PatientStatus, completedAt: nowSec };
  const eventMsg = `Patient ${patient.ticketNumber} completed`;
  await insertEvent('complete', patient.id, eventMsg);
  const msg = await notifyPatient('completed', refreshed, origin);
  await insertNotif('completed', msg, patient.id, patient.ticketNumber);

  return refreshed;
}

export async function resolveServicePointIdForPatient(patientId: string): Promise<string | null> {
  if (!patientId) return null;

  const { servicePoints } = await loadLiveState();
  const fromDesk = servicePoints.find((s) => s.currentPatient?.id === patientId)?.id;
  if (fromDesk) return fromDesk;

  const { data } = await supabase
    .from('patients')
    .select('service_point_id, status')
    .eq('id', patientId)
    .maybeSingle();

  if (data?.service_point_id && data.status === 'serving') {
    return data.service_point_id;
  }
  return null;
}

export async function completeService(
  servicePointId: string,
  origin?: string
): Promise<Patient | null> {
  assertConfigured();

  const { servicePoints } = await loadLiveState();
  const sp = servicePoints.find((s) => s.id === servicePointId);
  if (!sp) return null;

  let patient = sp.currentPatient;
  if (!patient) {
    const { data } = await supabase
      .from('patients')
      .select('*')
      .eq('service_point_id', servicePointId)
      .eq('status', 'serving')
      .limit(1)
      .maybeSingle();
    if (data) patient = rowToPatientLive(data as PatientRow);
  }
  if (!patient) return null;
  const now = new Date();
  const nowIso = now.toISOString();
  const nowSec = Math.floor(now.getTime() / 1000);
  const servedSec = patient.servedAt ?? patient.joinedAt;
  const serviceTime = Math.max(0, nowSec - servedSec);
  const newAvg =
    sp.patientsServed === 0
      ? serviceTime
      : Math.round(sp.avgServiceTime * 0.8 + serviceTime * 0.2);

  await supabase
    .from('patients')
    .update({
      status: 'completed',
      completed_at: nowIso,
      sim_completed_at_sec: nowSec,
      service_point_id: null,
      updated_at: nowIso,
    })
    .eq('id', patient.id);

  await supabase
    .from('service_points')
    .update({
      current_patient_id: null,
      patients_served: sp.patientsServed + 1,
      avg_service_time_sec: newAvg,
      updated_at: nowIso,
    })
    .eq('id', servicePointId);

  const worked = Math.max(0, nowSec - patient.joinedAt);
  await supabase.from('patient_service_history').upsert(
    {
      patient_id: patient.id,
      ticket_number: patient.ticketNumber,
      patient_name: patient.name?.trim() || null,
      service_type: patient.serviceType,
      channel: patient.channel,
      joined_sim_sec: patient.joinedAt,
      served_sim_sec: patient.servedAt ?? null,
      completed_sim_sec: nowSec,
      worked_duration_sec: worked,
    },
    { onConflict: 'patient_id' }
  );

  const updated = await loadLiveState();
  await recalculateAllQueues(updated.patients, updated.servicePoints);

  const refreshed = { ...patient, status: 'completed' as PatientStatus, completedAt: nowSec };
  const eventMsg = `Patient ${patient.ticketNumber} completed at ${formatServiceLabel(sp.type)}`;
  await insertEvent('complete', patient.id, eventMsg, servicePointId);
  const msg = await notifyPatient('completed', refreshed, origin);
  await insertNotif('completed', msg, patient.id, patient.ticketNumber);

  return refreshed;
}

export async function markNoShow(patientId: string): Promise<Patient | null> {
  assertConfigured();

  const { patients } = await loadLiveState();
  const patient = patients.find((p) => p.id === patientId);
  if (!patient || patient.status !== 'waiting') return null;

  const now = new Date().toISOString();
  await supabase
    .from('patients')
    .update({ status: 'no-show', updated_at: now })
    .eq('id', patientId);

  const updated = await loadLiveState();
  await recalculateAllQueues(updated.patients, updated.servicePoints);

  const eventMsg = `Patient ${patient.ticketNumber} marked as no-show`;
  await insertEvent('alert', patientId, eventMsg);

  return { ...patient, status: 'no-show' };
}

export async function toggleServicePoint(
  servicePointId: string
): Promise<ServicePoint | null> {
  assertConfigured();

  const { servicePoints } = await loadLiveState();
  const sp = servicePoints.find((s) => s.id === servicePointId);
  if (!sp) return null;

  const newStatus: ServicePointStatus = sp.status === 'active' ? 'break' : 'active';
  const now = new Date().toISOString();

  await supabase
    .from('service_points')
    .update({ status: newStatus, updated_at: now })
    .eq('id', servicePointId);

  const updated = await loadLiveState();
  return updated.servicePoints.find((s) => s.id === servicePointId) ?? null;
}

export async function getPatientByTicket(ticketNumber: string): Promise<Patient | null> {
  const { patients } = await loadLiveState();
  return patients.find((p) => p.ticketNumber.toUpperCase() === ticketNumber.toUpperCase()) ?? null;
}
