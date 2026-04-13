-- QFlow: Smart Virtual Queue Management System - Initial Schema
-- Run this in Supabase SQL Editor or via: supabase db push

-- Enums matching queueEngine.ts
CREATE TYPE service_type_enum AS ENUM (
  'opd-triage', 'consultation', 'pharmacy', 'laboratory', 'cashier'
);

CREATE TYPE service_point_status_enum AS ENUM ('active', 'inactive', 'break');

CREATE TYPE patient_priority_enum AS ENUM ('normal', 'high', 'urgent');

CREATE TYPE patient_status_enum AS ENUM ('waiting', 'serving', 'completed', 'no-show');

CREATE TYPE patient_channel_enum AS ENUM ('ussd', 'sms', 'app', 'walk-in');

CREATE TYPE queue_event_type_enum AS ENUM ('join', 'serve', 'complete', 'alert');

CREATE TYPE notification_type_enum AS ENUM ('joined', 'turn_next', 'completed');

-- service_points (current_patient_id added after patients table)
CREATE TABLE service_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type service_type_enum NOT NULL,
  status service_point_status_enum NOT NULL DEFAULT 'active',
  staff_name TEXT NOT NULL,
  patients_served INTEGER NOT NULL DEFAULT 0,
  avg_service_time_sec INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- patients
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  visit_reason TEXT,
  ticket_number TEXT NOT NULL,
  priority patient_priority_enum NOT NULL,
  priority_reason TEXT,
  status patient_status_enum NOT NULL,
  service_type service_type_enum NOT NULL,
  service_point_id TEXT REFERENCES service_points(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  served_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_wait_sec INTEGER NOT NULL DEFAULT 0,
  queue_position INTEGER NOT NULL DEFAULT 0,
  channel patient_channel_enum NOT NULL,
  sim_joined_at_sec INTEGER,
  sim_served_at_sec INTEGER,
  sim_completed_at_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add current_patient_id to service_points (FK to patients)
ALTER TABLE service_points
  ADD COLUMN current_patient_id TEXT REFERENCES patients(id);

-- Indexes for patients
CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_patients_service_type ON patients(service_type);
CREATE UNIQUE INDEX idx_patients_ticket_number ON patients(ticket_number);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_created_at ON patients(created_at DESC);

-- queue_events
CREATE TABLE queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type queue_event_type_enum NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  service_point_id TEXT REFERENCES service_points(id),
  message TEXT,
  sim_time_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_events_created_at ON queue_events(created_at DESC);

-- notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  ticket_number TEXT,
  message TEXT NOT NULL,
  type notification_type_enum NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- metrics_snapshots
CREATE TABLE metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_timestamp_sec INTEGER NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_snapshots_sim_timestamp ON metrics_snapshots(sim_timestamp_sec DESC);

-- simulation_config (single row)
CREATE TABLE simulation_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  speed INTEGER NOT NULL DEFAULT 1,
  auto_generate BOOLEAN NOT NULL DEFAULT true,
  patients_per_minute NUMERIC NOT NULL DEFAULT 0.5,
  avg_service_time INTEGER NOT NULL DEFAULT 300,
  priority_ratio NUMERIC NOT NULL DEFAULT 0.15,
  failure_rate NUMERIC NOT NULL DEFAULT 0.02,
  active_scenario TEXT NOT NULL DEFAULT 'normal-day',
  simulation_time_sec INTEGER NOT NULL DEFAULT 0,
  is_running BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO simulation_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- RLS: allow all for unauthenticated demo (no auth)
ALTER TABLE service_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service_points" ON service_points FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for patients" ON patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for queue_events" ON queue_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for metrics_snapshots" ON metrics_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for simulation_config" ON simulation_config FOR ALL USING (true) WITH CHECK (true);
