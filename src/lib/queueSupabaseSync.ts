/**
 * Sync layer: persist QueueSimulator state to Supabase and load it back.
 * Maps queueEngine types to DB rows.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { Patient, ServicePoint, QueueMetrics } from './queueEngine';
import type {
  PatientRow,
  ServicePointRow,
  QueueEventRow,
  NotificationRow,
  SimulationConfigRow,
  PatientServiceHistoryRow,
} from './database.types';
import type {
  QueueEventTypeDb,
  NotificationTypeDb,
  PatientChannelDb,
} from './database.types';

// ---------------------------------------------------------------------------
// Patient: engine <-> DB
// ---------------------------------------------------------------------------

function toDbChannel(ch: string): PatientChannelDb {
  const lower = ch?.toLowerCase() ?? 'app';
  if (lower === 'ussd' || lower === 'sms' || lower === 'app' || lower === 'walk-in') return lower;
  return 'app';
}

export function patientToRow(p: Patient, servicePointId?: string | null): Omit<PatientRow, 'created_at' | 'updated_at'> {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    visit_reason: p.visitReason ?? null,
    ticket_number: p.ticketNumber,
    priority: p.priority,
    priority_reason: p.priorityReason ?? null,
    status: p.status,
    service_type: p.serviceType,
    service_point_id: servicePointId ?? null,
    joined_at: new Date().toISOString(),
    served_at: p.servedAt != null ? new Date().toISOString() : null,
    completed_at: p.completedAt != null ? new Date().toISOString() : null,
    estimated_wait_sec: Math.round(Number(p.estimatedWait)) || 0,
    queue_position: Math.round(Number(p.queuePosition)) || 0,
    channel: toDbChannel(p.channel),
    sim_joined_at_sec: Math.round(Number(p.joinedAt)) || 0,
    sim_served_at_sec: p.servedAt != null ? Math.round(Number(p.servedAt)) : null,
    sim_completed_at_sec: p.completedAt != null ? Math.round(Number(p.completedAt)) : null,
  };
}

export function rowToPatient(r: PatientRow): Patient {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    visitReason: r.visit_reason ?? undefined,
    ticketNumber: r.ticket_number,
    priority: r.priority,
    priorityReason: r.priority_reason as 'elderly' | 'pregnant' | 'pwd' | 'child' | undefined,
    status: r.status,
    serviceType: r.service_type,
    joinedAt: r.sim_joined_at_sec ?? 0,
    servedAt: r.sim_served_at_sec ?? undefined,
    completedAt: r.sim_completed_at_sec ?? undefined,
    estimatedWait: r.estimated_wait_sec,
    queuePosition: r.queue_position,
    channel: r.channel,
  };
}

// ---------------------------------------------------------------------------
// ServicePoint: engine <-> DB (currentPatient resolved separately)
// ---------------------------------------------------------------------------

export function servicePointToRow(sp: ServicePoint): Omit<ServicePointRow, 'created_at' | 'updated_at'> {
  return {
    id: sp.id,
    name: sp.name,
    type: sp.type,
    status: sp.status,
    staff_name: sp.staffName,
    patients_served: sp.patientsServed,
    avg_service_time_sec: sp.avgServiceTime,
    current_patient_id: sp.currentPatient?.id ?? null,
  };
}

export function rowToServicePoint(r: ServicePointRow, currentPatient?: Patient): ServicePoint {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    staffName: r.staff_name,
    patientsServed: r.patients_served,
    avgServiceTime: r.avg_service_time_sec,
    currentPatient,
  };
}

// ---------------------------------------------------------------------------
// Persist: single operations
// ---------------------------------------------------------------------------

export async function upsertPatient(patient: Patient, servicePointId?: string | null): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = patientToRow(patient, servicePointId);
    const { error } = await supabase.from('patients').upsert(
      { ...row, updated_at: new Date().toISOString() } as Record<string, unknown>,
      { onConflict: 'id' }
    );
    if (error) console.warn('[QFlow] patients upsert:', error.message);
  } catch (e) {
    console.warn('[QFlow] patients upsert failed:', e);
  }
}

export async function upsertServicePoint(sp: ServicePoint): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = servicePointToRow(sp);
    const { error } = await supabase.from('service_points').upsert(
      { ...row, updated_at: new Date().toISOString() } as Record<string, unknown>,
      { onConflict: 'id' }
    );
    if (error) console.warn('[QFlow] service_points upsert:', error.message);
  } catch (e) {
    console.warn('[QFlow] service_points upsert failed:', e);
  }
}

export async function insertQueueEvent(
  type: QueueEventTypeDb,
  patientId: string,
  message: string,
  servicePointId?: string | null,
  simTimeSec?: number
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('queue_events').insert({
      type,
      patient_id: patientId,
      service_point_id: servicePointId ?? null,
      message: message || null,
      sim_time_sec: simTimeSec ?? null,
    });
    if (error) console.warn('[QFlow] queue_events insert:', error.message);
  } catch (e) {
    console.warn('[QFlow] queue_events insert failed:', e);
  }
}

export async function insertNotification(
  type: NotificationTypeDb,
  message: string,
  patientId?: string | null,
  ticketNumber?: string | null
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('notifications').insert({
      type,
      message: message || '',
      patient_id: patientId ?? null,
      ticket_number: ticketNumber ?? null,
    });
    if (error) console.warn('[QFlow] notifications insert:', error.message);
  } catch (e) {
    console.warn('[QFlow] notifications insert failed:', e);
  }
}

export async function saveMetricsSnapshot(simTimestampSec: number, metrics: QueueMetrics): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase.from('metrics_snapshots').insert({
      sim_timestamp_sec: simTimestampSec,
      metrics: metrics as unknown as Record<string, unknown>,
    });
    if (error) console.warn('[QFlow] metrics_snapshots insert:', error.message);
  } catch (e) {
    console.warn('[QFlow] metrics_snapshots insert failed:', e);
  }
}

export async function saveSimulationConfig(config: {
  speed: number;
  auto_generate: boolean;
  patients_per_minute: number;
  avg_service_time: number;
  priority_ratio: number;
  failure_rate: number;
  active_scenario: string;
  simulation_time_sec: number;
  is_running: boolean;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabase
      .from('simulation_config')
      .update({
        ...config,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');
    if (error) console.warn('[QFlow] simulation_config update:', error.message);
  } catch (e) {
    console.warn('[QFlow] simulation_config update failed:', e);
  }
}

export async function insertPatientServiceHistory(patient: Patient): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const worked =
    patient.completedAt != null && patient.joinedAt != null
      ? Math.max(0, Math.round(Number(patient.completedAt) - Number(patient.joinedAt)))
      : patient.servedAt != null && patient.completedAt != null
        ? Math.max(0, Math.round(Number(patient.completedAt) - Number(patient.servedAt)))
        : null;
  try {
    const { error } = await supabase.from('patient_service_history').upsert(
      {
        patient_id: patient.id,
        ticket_number: patient.ticketNumber,
        patient_name: patient.name?.trim() || null,
        service_type: patient.serviceType,
        channel: toDbChannel(patient.channel),
        joined_sim_sec: patient.joinedAt ?? null,
        served_sim_sec: patient.servedAt ?? null,
        completed_sim_sec: patient.completedAt ?? null,
        worked_duration_sec: worked,
      } as Record<string, unknown>,
      { onConflict: 'patient_id' }
    );
    if (error) console.warn('[QFlow] patient_service_history upsert:', error.message);
  } catch (e) {
    console.warn('[QFlow] patient_service_history upsert failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Load: full state for rehydration
// ---------------------------------------------------------------------------

/** Returns the maximum ticket number (numeric part) in the DB, or 0. Use to avoid reusing ticket numbers. */
export async function loadMaxTicketNumber(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await supabase.from('patients').select('ticket_number');
  if (error || !data?.length) return 0;
  let max = 0;
  for (const row of data as { ticket_number: string }[]) {
    const m = String(row?.ticket_number ?? '').match(/QF-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export async function loadPatients(): Promise<PatientRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('patients').select('*').order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as PatientRow[];
}

export async function loadServicePoints(): Promise<ServicePointRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('service_points').select('*');
  if (error) return [];
  return (data ?? []) as ServicePointRow[];
}

export async function loadSimulationConfig(): Promise<SimulationConfigRow | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.from('simulation_config').select('*').eq('id', 'default').single();
  if (error || !data) return null;
  return data as SimulationConfigRow;
}

export async function loadQueueEvents(limit = 100): Promise<QueueEventRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('queue_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as QueueEventRow[];
}

export async function loadNotifications(limit = 50): Promise<NotificationRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as NotificationRow[];
}

export async function loadPatientServiceHistory(limit = 500): Promise<PatientServiceHistoryRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('patient_service_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as PatientServiceHistoryRow[];
}
