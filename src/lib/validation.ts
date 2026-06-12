/**
 * Shared input validation for QFlow forms and API routes.
 */

import type {
  PatientChannel,
  PatientPriority,
  PriorityReason,
  ServiceType,
} from './queueEngine';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Uganda international dialing prefix. */
export const UGANDA_COUNTRY_CODE = '+256';

/** Default telephone for the phone simulator device and manual patient form. */
export const DEFAULT_SIMULATOR_PHONE = `${UGANDA_COUNTRY_CODE}701234567`;

const UGANDA_PHONE_RE = /^(\+256|256|0)?[7][0-9]{8}$/;
const TICKET_RE = /^QF-\d{3,}$/i;
const NAME_RE = /^[a-zA-Z\u00C0-\u024F'.\-\s]{2,80}$/;

/** Strip letters and invalid characters while typing a phone number. */
export function sanitizePhoneInput(value: string): string {
  let result = '';
  for (const c of value) {
    if (c >= '0' && c <= '9') result += c;
    else if (c === '+' && result.length === 0) result += c;
    else if ((c === ' ' || c === '-') && result.length > 0) result += c;
  }
  return result;
}

export function normalizeUgandaPhone(input: string): string {
  const digits = input.replace(/\s|-/g, '');
  if (!digits) return '';
  if (digits.startsWith('+256')) return digits;
  if (digits.startsWith('256')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `${UGANDA_COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.startsWith('7')) return `${UGANDA_COUNTRY_CODE}${digits.replace(/^0+/, '')}`;
  return digits.startsWith('+') ? digits : `${UGANDA_COUNTRY_CODE}${digits}`;
}

/** Format any stored phone value for display with Uganda country code. */
export function formatUgandaPhoneDisplay(phone: string | undefined | null): string {
  if (!phone?.trim()) return '';
  return normalizeUgandaPhone(phone.trim());
}

export function isValidUgandaPhone(input: string): boolean {
  const normalized = normalizeUgandaPhone(input.trim());
  return UGANDA_PHONE_RE.test(normalized);
}

export function validateTelephone(telephone: string): string | null {
  const trimmed = telephone.trim();
  if (!trimmed) return 'Telephone number is required';
  if (!isValidUgandaPhone(trimmed)) {
    return 'Enter a valid Uganda mobile number (e.g. +2567XXXXXXXX)';
  }
  return null;
}

export function validatePatientName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Patient name is required';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 80) return 'Name must be 80 characters or fewer';
  if (!NAME_RE.test(trimmed)) return 'Name contains invalid characters';
  return null;
}

export function validateVisitReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return 'Reason for visit is required';
  if (trimmed.length < 3) return 'Reason must be at least 3 characters';
  if (trimmed.length > 500) return 'Reason must be 500 characters or fewer';
  return null;
}

export function validateTicketNumber(ticket: string): string | null {
  const trimmed = ticket.trim().toUpperCase();
  if (!trimmed) return 'Ticket number is required';
  if (!TICKET_RE.test(trimmed)) return 'Ticket must match format QF-001';
  return null;
}

export function validateSmsMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return 'Message cannot be empty';
  if (trimmed.length > 1000) return 'Message must be 1000 characters or fewer';
  return null;
}

const SERVICE_TYPES: ServiceType[] = [
  'opd-triage',
  'consultation',
  'pharmacy',
  'laboratory',
  'cashier',
];

const PRIORITIES: PatientPriority[] = ['normal', 'high', 'urgent'];
const CHANNELS: PatientChannel[] = ['ussd', 'sms', 'app', 'walk-in'];
const PRIORITY_REASONS: PriorityReason[] = ['elderly', 'pregnant', 'pwd', 'child', 'emergency'];

export interface PatientJoinInput {
  name: string;
  telephone: string;
  visitReason: string;
  serviceType: string;
  priority?: string;
  priorityReason?: string;
  channel?: string;
}

export function validatePatientJoinInput(input: PatientJoinInput): ValidationResult {
  const errors: Record<string, string> = {};

  const nameErr = validatePatientName(input.name);
  if (nameErr) errors.name = nameErr;

  const phoneErr = validateTelephone(input.telephone);
  if (phoneErr) errors.telephone = phoneErr;

  const reasonErr = validateVisitReason(input.visitReason);
  if (reasonErr) errors.visitReason = reasonErr;

  if (!SERVICE_TYPES.includes(input.serviceType as ServiceType)) {
    errors.serviceType = 'Invalid service type';
  }

  if (input.priority && !PRIORITIES.includes(input.priority as PatientPriority)) {
    errors.priority = 'Invalid priority';
  }

  if (
    input.priorityReason &&
    !PRIORITY_REASONS.includes(input.priorityReason as PriorityReason)
  ) {
    errors.priorityReason = 'Invalid priority reason';
  }

  if (input.channel) {
    const ch = input.channel.toLowerCase();
    if (!CHANNELS.includes(ch as PatientChannel)) {
      errors.channel = 'Invalid channel';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateUssdMenuOption(
  option: string,
  maxOption: number
): string | null {
  const n = parseInt(option, 10);
  if (Number.isNaN(n) || n < 1 || n > maxOption) {
    return `Enter a number between 1 and ${maxOption}`;
  }
  return null;
}
