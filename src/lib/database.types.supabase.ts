import type {
  ServicePointRow,
  PatientRow,
  QueueEventRow,
  NotificationRow,
  MetricsSnapshotRow,
  SimulationConfigRow,
  PatientServiceHistoryRow,
} from './database.types';

export interface Database {
  public: {
    Tables: {
      service_points: {
        Row: ServicePointRow;
        Insert: Omit<ServicePointRow, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ServicePointRow, 'id'>>;
      };
      patients: {
        Row: PatientRow;
        Insert: Omit<PatientRow, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PatientRow, 'id'>>;
      };
      queue_events: {
        Row: QueueEventRow;
        Insert: Omit<QueueEventRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<QueueEventRow, 'id'>>;
      };
      notifications: {
        Row: NotificationRow;
        Insert: Omit<NotificationRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<NotificationRow, 'id'>>;
      };
      metrics_snapshots: {
        Row: MetricsSnapshotRow;
        Insert: Omit<MetricsSnapshotRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<MetricsSnapshotRow, 'id'>>;
      };
      simulation_config: {
        Row: SimulationConfigRow;
        Insert: SimulationConfigRow;
        Update: Partial<Omit<SimulationConfigRow, 'id'>>;
      };
      patient_service_history: {
        Row: PatientServiceHistoryRow;
        Insert: Omit<PatientServiceHistoryRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<PatientServiceHistoryRow, 'id'>>;
      };
    };
  };
}
