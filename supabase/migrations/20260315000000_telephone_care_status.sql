-- Telephone number, patient care status, and approaching-turn notifications

CREATE TYPE patient_care_status_enum AS ENUM ('normal', 'attention', 'emergency');

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS care_status patient_care_status_enum NOT NULL DEFAULT 'normal';

UPDATE patients SET telephone = phone WHERE telephone IS NULL;
ALTER TABLE patients ALTER COLUMN telephone SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_telephone ON patients(telephone);

-- Extend notification types for approaching-turn SMS
ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'turn_approaching';
