-- Add visit reason captured at queue join time
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS visit_reason TEXT;

