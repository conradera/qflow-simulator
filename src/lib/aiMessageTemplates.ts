export type UserMessageType = 'join' | 'turn_next' | 'turn_approaching' | 'completed';

const SERVICE_LABELS: Record<string, string> = {
  'opd-triage': 'OPD Triage',
  consultation: 'Doctor Consultation',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  cashier: 'Cashier',
};

export function formatServiceLabel(serviceType?: string): string {
  if (!serviceType) return 'your service';
  return SERVICE_LABELS[serviceType] ?? serviceType;
}

export function buildTemplateUserMessage(
  type: UserMessageType,
  opts: {
    ticketNumber: string;
    serviceType?: string;
    queuePosition?: number;
    estimatedWaitMin?: number;
  }
): string {
  const service = formatServiceLabel(opts.serviceType);
  const ticket = opts.ticketNumber;
  const position = opts.queuePosition ?? '?';
  const wait = opts.estimatedWaitMin ?? '?';

  switch (type) {
    case 'join':
      return `QFlow: You are #${position} in line for ${service}. Est. wait: ${wait} min. Mukono Health Centre IV.`;
    case 'turn_approaching':
      return `QFlow: Your turn is approaching! You are #${position} for ${service}. Please stay nearby. Mukono Health Centre IV.`;
    case 'turn_next':
      return `QFlow: It is your turn (${ticket})! Please proceed to the ${service} service point. Mukono Health Centre IV.`;
    case 'completed':
      return `QFlow: Thank you for visiting Mukono Health Centre IV (${ticket}). Have a healthy day!`;
    default:
      return `QFlow update for ticket ${ticket}. Mukono Health Centre IV.`;
  }
}

export interface SmsPatientContext {
  ticketNumber: string;
  name?: string;
  status: string;
  queuePosition: number;
  estimatedWaitMin: number;
  serviceType?: string;
}

export function buildContextualSmsReply(
  userMessage: string,
  totalWaiting: number,
  patient?: SmsPatientContext
): string {
  const lower = userMessage.toLowerCase();
  const service = formatServiceLabel(patient?.serviceType);
  const firstName = patient?.name?.trim().split(/\s+/)[0];

  if (patient) {
    if (
      lower.includes('position') ||
      lower.includes('wait') ||
      lower.includes('queue') ||
      lower.includes('turn') ||
      lower.includes('how long')
    ) {
      if (patient.status === 'waiting') {
        return `QFlow: Hi${firstName ? ` ${firstName}` : ''}! Ticket ${patient.ticketNumber} — you are #${patient.queuePosition} for ${service}. Est. wait ~${patient.estimatedWaitMin} min. Mukono Health Centre IV.`;
      }
      if (patient.status === 'serving') {
        return `QFlow: ${patient.ticketNumber} — it's your turn! Please proceed to ${service} now. Mukono Health Centre IV.`;
      }
      if (patient.status === 'completed') {
        return `QFlow: Your visit (${patient.ticketNumber}) is complete. Thank you for choosing Mukono Health Centre IV!`;
      }
    }

    if (lower.includes('ticket') || lower.includes(patient.ticketNumber.toLowerCase())) {
      return `QFlow: Ticket ${patient.ticketNumber} — status: ${patient.status}.${patient.status === 'waiting' ? ` Position #${patient.queuePosition}, ~${patient.estimatedWaitMin} min wait for ${service}.` : ''} Mukono Health Centre IV.`;
    }
  }

  return buildTemplateSmsReply(userMessage, totalWaiting);
}

export function buildTemplateSmsReply(userMessage: string, totalWaiting: number): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes('position') || lower.includes('wait') || lower.includes('queue')) {
    return `QFlow: ${totalWaiting} patient(s) are currently waiting. Check your position with your ticket number via *285*70#.`;
  }
  if (lower.includes('cancel')) {
    return 'QFlow: To cancel your booking, dial *285*70# and choose Cancel Booking, then enter your ticket number.';
  }
  return 'QFlow: Thanks for your message. For queue help, dial *285*70# or reply with your ticket number.';
}
