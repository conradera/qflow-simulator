import { NextRequest, NextResponse } from 'next/server';
import {
  completeService,
  completePatientById,
  QueueServiceError,
} from '@/lib/queueService';

export async function POST(request: NextRequest) {
  try {
    const { servicePointId, patientId } = await request.json();

    if (patientId) {
      const patient = await completePatientById(patientId, request.nextUrl?.origin);
      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found or not currently being served' },
          { status: 404 }
        );
      }
      return NextResponse.json({ patient });
    }

    if (!servicePointId) {
      return NextResponse.json({ error: 'servicePointId or patientId required' }, { status: 400 });
    }

    const patient = await completeService(servicePointId, request.nextUrl?.origin);
    if (!patient) {
      return NextResponse.json({ error: 'No patient at service point' }, { status: 409 });
    }
    return NextResponse.json({ patient });
  } catch (e) {
    if (e instanceof QueueServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Complete failed' }, { status: 500 });
  }
}
