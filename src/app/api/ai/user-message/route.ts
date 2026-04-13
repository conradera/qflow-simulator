import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openrouter/free';

const SERVICE_LABELS: Record<string, string> = {
  'opd-triage': 'OPD Triage',
  consultation: 'Doctor Consultation',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  cashier: 'Cashier',
};

export type UserMessageType = 'join' | 'turn_next' | 'completed';

export interface UserMessageBody {
  type: UserMessageType;
  ticketNumber: string;
  serviceType?: string;
  queuePosition?: number;
  estimatedWaitMin?: number;
}

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY is not set' },
      { status: 500 }
    );
  }

  let body: UserMessageBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { type, ticketNumber, serviceType, queuePosition, estimatedWaitMin } = body;
  const serviceLabel = serviceType ? (SERVICE_LABELS[serviceType] ?? serviceType) : '';

  const prompts: Record<UserMessageType, string> = {
    join: `Generate ONE short message (SMS/USSD, max 2 sentences) to send to a patient who just joined a health centre queue. Ticket: ${ticketNumber}. Service: ${serviceLabel}. Position in line: ${queuePosition ?? '?'}. Estimated wait: ${estimatedWaitMin ?? '?'} minutes. Sign off as QFlow / Mukono Health Centre IV. Be friendly and clear. Reply with ONLY the message text, no quotes or explanation.`,
    turn_next: `Generate ONE short message (SMS/USSD, max 2 sentences) telling a patient it is their turn. Ticket: ${ticketNumber}. Service: ${serviceLabel}. Ask them to proceed to the ${serviceLabel} service point. Sign off as QFlow. Reply with ONLY the message text, no quotes or explanation.`,
    completed: `Generate ONE short message (SMS/USSD, 1 sentence) to thank a patient after they completed service at Mukono Health Centre IV. Ticket: ${ticketNumber}. Wish them a healthy day. Sign off as QFlow. Reply with ONLY the message text, no quotes or explanation.`,
  };

  const prompt = prompts[type];
  if (!prompt) {
    return NextResponse.json(
      { error: 'Invalid type' },
      { status: 400 }
    );
  }

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
        max_tokens: 120,
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
    const message =
      data?.choices?.[0]?.message?.content?.trim()?.replace(/^["']|["']$/g, '') ||
      '';

    return NextResponse.json({ message });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'AI message failed', details: err },
      { status: 500 }
    );
  }
}
