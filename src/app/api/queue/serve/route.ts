import { NextRequest, NextResponse } from 'next/server';
import { serveNext, QueueServiceError } from '@/lib/queueService';

export async function POST(request: NextRequest) {
  try {
    const { servicePointId } = await request.json();
    if (!servicePointId) {
      return NextResponse.json({ error: 'servicePointId is required' }, { status: 400 });
    }
    const patient = await serveNext(servicePointId, request.nextUrl?.origin);
    if (!patient) {
      return NextResponse.json({ error: 'No patient available or desk busy' }, { status: 409 });
    }
    return NextResponse.json({ patient });
  } catch (e) {
    if (e instanceof QueueServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Serve failed' }, { status: 500 });
  }
}
