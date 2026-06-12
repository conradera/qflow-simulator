-- Add telephone to completed-patient history
ALTER TABLE patient_service_history
  ADD COLUMN IF NOT EXISTS telephone TEXT;

UPDATE patient_service_history h
SET telephone = COALESCE(p.telephone, p.phone)
FROM patients p
WHERE h.patient_id = p.id
  AND (h.telephone IS NULL OR h.telephone = '');
