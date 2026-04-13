-- Store completed-patient history and worked time
CREATE TABLE IF NOT EXISTS patient_service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  patient_name TEXT,
  service_type service_type_enum NOT NULL,
  channel patient_channel_enum NOT NULL,
  joined_sim_sec INTEGER,
  served_sim_sec INTEGER,
  completed_sim_sec INTEGER,
  worked_duration_sec INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_service_history_created_at
  ON patient_service_history(created_at DESC);

ALTER TABLE patient_service_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY patient_service_history_all
  ON patient_service_history
  FOR ALL
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

