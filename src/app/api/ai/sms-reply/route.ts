import { NextRequest, NextResponse } from 'next/server';
import {
  buildContextualSmsReply,
  formatServiceLabel,
  type SmsPatientContext,
} from '@/lib/aiMessageTemplates';
import { requestOpenRouterChat } from '@/lib/openrouter';

interface SmsReplyBody {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  queueStats?: { totalWaiting?: number };
  ticketNumber?: string;
  patientContext?: SmsPatientContext;
}

export async function POST(request: NextRequest) {
  let body: SmsReplyBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const waiting = body.queueStats?.totalWaiting ?? 0;
  const history = (body.history ?? []).slice(-8);
  const patient = body.patientContext;
  const fallback = buildContextualSmsReply(userMessage, waiting, patient);

  const patientSummary = patient
    ? `Known patient: ticket ${patient.ticketNumber}, name ${patient.name ?? 'unknown'}, status ${patient.status}, position #${patient.queuePosition}, est. wait ${patient.estimatedWaitMin} min, service ${formatServiceLabel(patient.serviceType)}.`
    : body.ticketNumber
      ? `Patient ticket hint: ${body.ticketNumber}.`
      : 'No patient ticket linked to this SMS thread yet.';

  const systemPrompt =
    'You are QFlow, the AI SMS assistant for Mukono Health Centre IV queue system in Uganda. ' +
    'Reply like a real SMS: warm, concise, under 240 characters. ' +
    'Help with queue position, wait time, ticket status, directions to service points, and cancellations via *285*70#. ' +
    'Use the patient context when available. Do not give medical advice. Sign off as QFlow.';

  const messages = [
    {
      role: 'system' as const,
      content: `${systemPrompt}\n\nPatients waiting in queue: ${waiting}.\n${patientSummary}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user' as const, content: userMessage },
  ];

  const aiReply = await requestOpenRouterChat(messages, request.nextUrl?.origin, 180);

  return NextResponse.json({
    reply: aiReply ?? fallback,
    source: aiReply ? 'ai' : 'template',
  });
}
