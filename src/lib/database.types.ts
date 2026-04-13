// Database row types matching Supabase schema (queueEngine-aligned)

export type ServiceTypeDb =
  | 'opd-triage'
  | 'consultation'
  | 'pharmacy'
  | 'laboratory'
  | 'cashier';

export type ServicePointStatusDb = 'active' | 'inactive' | 'break';
export type PatientPriorityDb = 'normal' | 'high' | 'urgent';
export type PatientStatusDb = 'waiting' | 'serving' | 'completed' | 'no-show';
export type PatientChannelDb = 'ussd' | 'sms' | 'app' | 'walk-in';
export type QueueEventTypeDb = 'join' | 'serve' | 'complete' | 'alert';
export type NotificationTypeDb = 'joined' | 'turn_next' | 'completed';

export interface ServicePointRow {
  id: string;
  name: string;
  type: ServiceTypeDb;
  status: ServicePointStatusDb;
  staff_name: string;
  patients_served: number;
  avg_service_time_sec: number;
  current_patient_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientRow {
  id: string;
  name: string;
  phone: string;
  visit_reason: string | null;
  ticket_number: string;
  priority: PatientPriorityDb;
  priority_reason: string | null;
  status: PatientStatusDb;
  service_type: ServiceTypeDb;
  service_point_id: string | null;
  joined_at: string;
  served_at: string | null;
  completed_at: string | null;
  estimated_wait_sec: number;
  queue_position: number;
  channel: PatientChannelDb;
  sim_joined_at_sec: number | null;
  sim_served_at_sec: number | null;
  sim_completed_at_sec: number | null;
  created_at: string;
  updated_at: string;
}

export interface QueueEventRow {
  id: string;
  type: QueueEventTypeDb;
  patient_id: string;
  service_point_id: string | null;
  message: string | null;
  sim_time_sec: number | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  patient_id: string | null;
  ticket_number: string | null;
  message: string;
  type: NotificationTypeDb;
  created_at: string;
}

export interface MetricsSnapshotRow {
  id: string;
  sim_timestamp_sec: number;
  metrics: Record<string, unknown>;
  created_at: string;
}

export interface SimulationConfigRow {
  id: string;
  speed: number;
  auto_generate: boolean;
  patients_per_minute: number;
  avg_service_time: number;
  priority_ratio: number;
  failure_rate: number;
  active_scenario: string;
  simulation_time_sec: number;
  is_running: boolean;
  updated_at: string;
}

export interface PatientServiceHistoryRow {
  id: string;
  patient_id: string;
  ticket_number: string;
  patient_name: string | null;
  service_type: ServiceTypeDb;
  channel: PatientChannelDb;
  joined_sim_sec: number | null;
  served_sim_sec: number | null;
  completed_sim_sec: number | null;
  worked_duration_sec: number | null;
  created_at: string;
}
