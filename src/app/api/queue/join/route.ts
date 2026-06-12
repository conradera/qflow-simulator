import { NextRequest, NextResponse } from 'next/server';
import { joinPatient, QueueServiceError } from '@/lib/queueService';
import { validatePatientJoinInput, normalizeUgandaPhone } from '@/lib/validation';
import type { ServiceType, PatientPriority, PriorityReason, PatientChannel } from '@/lib/queueEngine';

const SERVICE_MAP: Record<string, ServiceType> = {
  'opd-triage': 'opd-triage',
  'doctor-consultation': 'consultation',
  consultation: 'consultation',
  pharmacy: 'pharmacy',
  laboratory: 'laboratory',
  cashier: 'cashier',
};

const PRIORITY_MAP: Record<string, { priority: PatientPriority; reason?: PriorityReason }> = {
  normal: { priority: 'normal' },
  high: { priority: 'high' },
  urgent: { priority: 'urgent' },
  elderly: { priority: 'high', reason: 'elderly' },
  pregnant: { priority: 'high', reason: 'pregnant' },
  disability: { priority: 'high', reason: 'pwd' },
  pwd: { priority: 'high', reason: 'pwd' },
  child: { priority: 'urgent', reason: 'child' },
  emergency: { priority: 'urgent', reason: 'emergency' },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const serviceType = SERVICE_MAP[body.serviceType] ?? body.serviceType;
    const prioKey = body.priorityReason ?? body.priority ?? 'normal';
    const prio = PRIORITY_MAP[prioKey] ?? { priority: 'normal' as PatientPriority };
    const telephone = normalizeUgandaPhone(body.telephone ?? body.contact ?? '');

    const validation = validatePatientJoinInput({
      name: body.name,
      telephone,
      visitReason: body.visitReason,
      serviceType,
      priority: prio.priority,
      priorityReason: body.priorityReason ?? prio.reason,
      channel: body.channel,
    });

    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const channel = (body.channel?.toLowerCase() ?? 'walk-in') as PatientChannel;
    const patient = await joinPatient(
      {
        name: body.name.trim(),
        telephone,
        visitReason: body.visitReason.trim(),
        serviceType,
        priority: prio.priority,
        priorityReason: body.priorityReason ?? prio.reason,
        channel,
      },
      request.nextUrl?.origin
    );

    return NextResponse.json({ patient });
  } catch (e) {
    if (e instanceof QueueServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Join failed' }, { status: 500 });
  }
}
