import { NextRequest, NextResponse } from 'next/server';
import { markNoShow, QueueServiceError } from '@/lib/queueService';

export async function POST(request: NextRequest) {
  try {
    const { patientId } = await request.json();
    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }
    const patient = await markNoShow(patientId);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found or not waiting' }, { status: 404 });
    }
    return NextResponse.json({ patient });
  } catch (e) {
    if (e instanceof QueueServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'No-show failed' }, { status: 500 });
  }
}
