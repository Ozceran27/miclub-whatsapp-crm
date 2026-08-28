-- Moneda explícita para remuneraciones fijas y términos FIXED.
-- Backfill: se toma la moneda operativa del último lote de saldos iniciales APPLIED;
-- si el club nunca completó onboarding (y por tanto no tiene lote), se usa
-- clubs.base_currency_code. No se infiere la moneda desde importes ni movimientos.
BEGIN;

ALTER TABLE miclub.employees ADD COLUMN IF NOT EXISTS currency_code text;
ALTER TABLE miclub.activity_terms ADD COLUMN IF NOT EXISTS currency_code text;

UPDATE miclub.employees e
SET currency_code = coalesce(ob.operational_currency_code, c.base_currency_code)
FROM miclub.clubs c
LEFT JOIN LATERAL (
  SELECT b.operational_currency_code
  FROM miclub.opening_balance_batches b
  WHERE b.club_id=c.id AND b.status='APPLIED'
  ORDER BY b.revision DESC, b.created_at DESC LIMIT 1
) ob ON true
WHERE e.club_id=c.id AND e.has_fixed_compensation AND e.currency_code IS NULL;

UPDATE miclub.activity_terms t
SET currency_code = coalesce(ob.operational_currency_code, c.base_currency_code)
FROM miclub.clubs c
LEFT JOIN LATERAL (
  SELECT b.operational_currency_code
  FROM miclub.opening_balance_batches b
  WHERE b.club_id=c.id AND b.status='APPLIED'
  ORDER BY b.revision DESC, b.created_at DESC LIMIT 1
) ob ON true
WHERE t.club_id=c.id AND t.mode='FIXED' AND t.currency_code IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM miclub.employees WHERE has_fixed_compensation AND currency_code IS NULL) THEN
    RAISE EXCEPTION 'No se pudo determinar la moneda de remuneraciones fijas';
  END IF;
  IF EXISTS (SELECT 1 FROM miclub.activity_terms WHERE mode='FIXED' AND currency_code IS NULL) THEN
    RAISE EXCEPTION 'No se pudo determinar la moneda de términos FIXED';
  END IF;
END $$;

ALTER TABLE miclub.employees
  ADD CONSTRAINT employees_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code),
  ADD CONSTRAINT employees_fixed_compensation_currency_check CHECK (
    (has_fixed_compensation AND currency_code IS NOT NULL) OR
    (NOT has_fixed_compensation AND currency_code IS NULL)
  );
ALTER TABLE miclub.activity_terms
  ADD CONSTRAINT activity_terms_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code),
  ADD CONSTRAINT activity_terms_mode_currency_check CHECK (
    (mode='FIXED' AND currency_code IS NOT NULL) OR
    (mode='VARIABLE' AND currency_code IS NULL)
  );

COMMENT ON COLUMN miclub.employees.currency_code IS 'Moneda explícita de fixed_compensation_amount; NULL cuando no hay remuneración fija. Para clubes sin lote de onboarding el backfill usa clubs.base_currency_code.';
COMMENT ON COLUMN miclub.activity_terms.currency_code IS 'Moneda histórica de fixed_club_fee. Es obligatoria para FIXED y NULL por convención para VARIABLE; cada cambio se registra en una nueva versión del término.';

COMMIT;
