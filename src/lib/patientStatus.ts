/**
 * Patient care status: Green (Normal), Yellow (Attention), Red (Emergency/Critical).
 */

import type { Patient, PatientPriority, PriorityReason } from './queueEngine';

export type CareStatus = 'normal' | 'attention' | 'emergency';

export function deriveCareStatus(
  priority: PatientPriority,
  priorityReason?: PriorityReason
): CareStatus {
  if (
    priority === 'urgent' ||
    priorityReason === 'emergency' ||
    priorityReason === 'child'
  ) {
    return 'emergency';
  }
  if (
    priority === 'high' ||
    priorityReason === 'elderly' ||
    priorityReason === 'pregnant' ||
    priorityReason === 'pwd'
  ) {
    return 'attention';
  }
  return 'normal';
}

export function getPatientCareStatus(patient: Patient): CareStatus {
  return patient.careStatus ?? deriveCareStatus(patient.priority, patient.priorityReason);
}

export const CARE_STATUS_LABELS: Record<CareStatus, string> = {
  normal: 'Normal',
  attention: 'Attention Required',
  emergency: 'Emergency / Critical',
};

export const CARE_STATUS_STYLES: Record<CareStatus, string> = {
  normal: 'bg-green-100 text-green-800 border-green-300',
  attention: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  emergency: 'bg-red-100 text-red-800 border-red-300',
};

export const CARE_STATUS_DOT: Record<CareStatus, string> = {
  normal: 'bg-green-500',
  attention: 'bg-yellow-500',
  emergency: 'bg-red-500',
};
