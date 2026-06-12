import { NextRequest, NextResponse } from 'next/server';
import { toggleServicePoint, QueueServiceError } from '@/lib/queueService';

export async function PATCH(request: NextRequest) {
  try {
    const { servicePointId } = await request.json();
    if (!servicePointId) {
      return NextResponse.json({ error: 'servicePointId is required' }, { status: 400 });
    }
    const sp = await toggleServicePoint(servicePointId);
    if (!sp) {
      return NextResponse.json({ error: 'Service point not found' }, { status: 404 });
    }
    return NextResponse.json({ servicePoint: sp });
  } catch (e) {
    if (e instanceof QueueServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Toggle failed' }, { status: 500 });
  }
}
