import { NextRequest, NextResponse } from 'next/server';
import {
  buildTemplateUserMessage,
  type UserMessageType,
} from '@/lib/aiMessageTemplates';
import { requestOpenRouterChat } from '@/lib/openrouter';

const SERVICE_LABELS: Record<string, string> = {
  'opd-triage': 'OPD Triage',
  consultation: 'Doctor Consultation',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  cashier: 'Cashier',
};

export type { UserMessageType };

export interface UserMessageBody {
  type: UserMessageType;
  ticketNumber: string;
  serviceType?: string;
  queuePosition?: number;
  estimatedWaitMin?: number;
}

export async function POST(request: NextRequest) {
  let body: UserMessageBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, ticketNumber, serviceType, queuePosition, estimatedWaitMin } = body;
  if (!type || !ticketNumber?.trim()) {
    return NextResponse.json({ error: 'type and ticketNumber are required' }, { status: 400 });
  }

  const fallback = buildTemplateUserMessage(type, {
    ticketNumber,
    serviceType,
    queuePosition,
    estimatedWaitMin,
  });

  const validTypes: UserMessageType[] = ['join', 'turn_next', 'turn_approaching', 'completed'];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const serviceLabel = serviceType ? (SERVICE_LABELS[serviceType] ?? serviceType) : '';

  const prompts: Record<UserMessageType, string> = {
    join: `Generate ONE short message (SMS/USSD, max 2 sentences) to send to a patient who just joined a health centre queue. Ticket: ${ticketNumber}. Service: ${serviceLabel}. Position in line: ${queuePosition ?? '?'}. Estimated wait: ${estimatedWaitMin ?? '?'} minutes. Sign off as QFlow / Mukono Health Centre IV. Be friendly and clear. Reply with ONLY the message text, no quotes or explanation.`,
    turn_approaching: `Generate ONE short SMS (max 2 sentences) warning a patient their turn is approaching soon. Ticket: ${ticketNumber}. Service: ${serviceLabel}. They are position ${queuePosition ?? '?'}. Ask them to stay nearby. Sign off as QFlow / Mukono Health Centre IV. Reply with ONLY the message text, no quotes or explanation.`,
    turn_next: `Generate ONE short message (SMS/USSD, max 2 sentences) telling a patient it is their turn. Ticket: ${ticketNumber}. Service: ${serviceLabel}. Ask them to proceed to the ${serviceLabel} service point. Sign off as QFlow. Reply with ONLY the message text, no quotes or explanation.`,
    completed: `Generate ONE short message (SMS/USSD, 1 sentence) to thank a patient after they completed service at Mukono Health Centre IV. Ticket: ${ticketNumber}. Wish them a healthy day. Sign off as QFlow. Reply with ONLY the message text, no quotes or explanation.`,
  };

  const aiMessage = await requestOpenRouterChat(
    [{ role: 'user', content: prompts[type] }],
    request.nextUrl?.origin
  );

  return NextResponse.json({
    message: aiMessage ?? fallback,
    source: aiMessage ? 'ai' : 'template',
  });
}
