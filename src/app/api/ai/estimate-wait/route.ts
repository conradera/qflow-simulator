import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openrouter/free';

export interface EstimateWaitBody {
  serviceType?: string;
  queueSummary?: {
    waitingByService?: Record<string, number>;
    avgServiceTimesSec?: Record<string, number>;
    totalWaiting?: number;
  };
}

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY is not set' },
      { status: 500 }
    );
  }

  let body: EstimateWaitBody = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const { serviceType, queueSummary } = body;
  const waiting = queueSummary?.waitingByService ?? {};
  const avgTimes = queueSummary?.avgServiceTimesSec ?? {};
  const totalWaiting = queueSummary?.totalWaiting ?? 0;

  const serviceLabel = serviceType
    ? formatServiceLabel(serviceType)
    : 'any service';
  const waitingStr = Object.entries(waiting)
    .map(([k, v]) => `${formatServiceLabel(k)}: ${v} waiting`)
    .join(', ');
  const avgStr = Object.entries(avgTimes)
    .map(([k, v]) => `${formatServiceLabel(k)}: ~${Math.round(v / 60)} min avg`)
    .join(', ');

  const prompt = `You are a queue analyst for a health centre. Given the current queue state, estimate the wait time in minutes for a new patient joining now.

Current queue: ${waitingStr || 'No one waiting.'}
Average service times: ${avgStr || 'Not specified.'}
Total people waiting: ${totalWaiting}

Service of interest: ${serviceLabel}.

Reply in 1-2 short sentences. Include a number of minutes (e.g. "about 15 minutes" or "approximately 10-12 minutes"). If the queue is empty, say wait time is minimal (under 5 minutes).`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    };
    const referer = request.nextUrl?.origin;
    if (referer) headers['HTTP-Referer'] = referer;

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: 'OpenRouter request failed', details: errText },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content =
      data?.choices?.[0]?.message?.content?.trim() ||
      'Unable to estimate wait time.';

    const estimatedMinutes = parseMinutesFromText(content);

    return NextResponse.json({
      estimatedMinutes: estimatedMinutes ?? null,
      message: content,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'AI estimate failed', details: err },
      { status: 500 }
    );
  }
}

function formatServiceLabel(type: string): string {
  const labels: Record<string, string> = {
    'opd-triage': 'OPD Triage',
    consultation: 'Doctor Consultation',
    pharmacy: 'Pharmacy',
    laboratory: 'Laboratory',
    cashier: 'Cashier',
  };
  return labels[type] ?? type;
}

function parseMinutesFromText(text: string): number | null {
  const match = text.match(/(?:about|approximately|~|roughly)?\s*(\d+)\s*[-–]?\s*(\d+)?\s*min/i);
  if (match) {
    const a = parseInt(match[1], 10);
    const b = match[2] ? parseInt(match[2], 10) : a;
    return Math.round((a + b) / 2);
  }
  const single = text.match(/(\d+)\s*min/i);
  if (single) return parseInt(single[1], 10);
  return null;
}
