-- Modern employee creation writes has_fixed_compensation, amount/frequency and
-- currency. Legacy payment_mode is retained for historical readers only.
-- No historical values are changed. Manual execution on the real DB in DBeaver.
-- Rollback before COMMIT: ROLLBACK. After new rows are created, restoring NOT NULL
-- would reject the canonical model; deploy a forward fix, never invent values.
BEGIN;
DO $precheck$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='miclub.employees'::regclass AND conname='employees_fixed_compensation_check')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='miclub.employees'::regclass AND conname='employees_fixed_compensation_currency_check') THEN
  RAISE EXCEPTION 'Canonical compensation constraints must exist before retiring legacy requirement';
 END IF;
END $precheck$;
ALTER TABLE miclub.employees ALTER COLUMN payment_mode DROP NOT NULL;
COMMENT ON COLUMN miclub.employees.payment_mode IS 'Legacy historical value. New writes use has_fixed_compensation, fixed_compensation_amount/frequency and currency_code.';
DO $postcheck$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='miclub.employees'::regclass AND attname='payment_mode' AND attnotnull) THEN
  RAISE EXCEPTION 'Legacy payment_mode still required';
 END IF;
END $postcheck$;
COMMIT;
