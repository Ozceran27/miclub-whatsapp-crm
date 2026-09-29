-- miClub Gestión / instalación manual en DBeaver.
-- Requiere backup verificado y migraciones de precios y circuito financiero.
-- Ejecutar completo con rol administrador. No ejecutar con miclub_audit.
-- Las precondiciones abortan sin COMMIT si hay identidades de texto duplicadas.
BEGIN;

DO $$ BEGIN
  IF to_regclass('miclub.activity_price_terms') IS NULL OR to_regclass('miclub.receivables') IS NULL
     OR to_regclass('miclub.movements') IS NULL OR to_regclass('miclub.people') IS NULL THEN
    RAISE EXCEPTION 'ENROLLMENT_CHARGES_PREREQUISITES_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM miclub.people WHERE dni IS NOT NULL AND normalized_dni IS NULL
    AND upper(regexp_replace(dni,'[.[:space:]-]','','g'))<>''
    GROUP BY club_id,upper(regexp_replace(dni,'[.[:space:]-]','','g')) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'DUPLICATE_TEXT_IDENTITIES_REQUIRE_REVIEW';
  END IF;
END $$;

ALTER TABLE miclub.receivables
  ADD COLUMN IF NOT EXISTS charge_kind text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS price_term_id uuid;
ALTER TABLE miclub.receivables
  DROP CONSTRAINT IF EXISTS receivables_charge_kind_check,
  DROP CONSTRAINT IF EXISTS receivables_period_check,
  DROP CONSTRAINT IF EXISTS receivables_price_term_tenant_fkey;
ALTER TABLE miclub.receivables
  ADD CONSTRAINT receivables_charge_kind_check CHECK (charge_kind IS NULL OR charge_kind IN ('ENROLLMENT','FEE')),
  ADD CONSTRAINT receivables_period_check CHECK (period_end IS NULL OR period_start IS NOT NULL AND period_end >= period_start),
  ADD CONSTRAINT receivables_price_term_tenant_fkey FOREIGN KEY (price_term_id,club_id)
    REFERENCES miclub.activity_price_terms(id,club_id);
CREATE UNIQUE INDEX IF NOT EXISTS receivables_enrollment_fee_period_uidx
  ON miclub.receivables(club_id,enrollment_id,period_start)
  WHERE charge_kind='FEE' AND period_start IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_club_text_identity_uidx
  ON miclub.people(club_id,upper(regexp_replace(dni,'[.[:space:]-]','','g')))
  WHERE dni IS NOT NULL AND normalized_dni IS NULL AND upper(regexp_replace(dni,'[.[:space:]-]','','g'))<>'';

ALTER TABLE miclub.movements
  ADD COLUMN IF NOT EXISTS counterparty_document_type text,
  ADD COLUMN IF NOT EXISTS counterparty_document_value text;
ALTER TABLE miclub.movements
  DROP CONSTRAINT IF EXISTS movements_counterparty_document_check;
ALTER TABLE miclub.movements
  ADD CONSTRAINT movements_counterparty_document_check CHECK (
    (counterparty_document_type IS NULL AND counterparty_document_value IS NULL) OR
    (counterparty_document_type IN ('DNI','CUIL','REGISTRO')
      AND counterparty_document_value IS NOT NULL AND length(trim(counterparty_document_value)) BETWEEN 4 AND 80)
  );

-- Existing records remain unchanged. Enrollment fees now use explicit allocations.
CREATE OR REPLACE VIEW miclub.v_enrollment_lifecycle_v2 AS
WITH facts AS (
  SELECT e.id,e.club_id,e.status,e.status_override,
    coalesce(e.enrollment_date,e.created_at::date) enrollment_date,
    (max(pay.paid_at) FILTER (WHERE pa.amount>0))::date payment_last_payment_at,
    max((now() at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date) today,
    bool_or(r.due_date <= (now() at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date
      AND r.amount-r.cancelled_amount-coalesce(applied.amount,0)>0) has_due_debt,
    min(r.due_date) FILTER (WHERE r.charge_kind='FEE' OR r.source_key LIKE 'monthly:%') first_fee_due
    ,count(DISTINCT r.id) FILTER (WHERE (r.charge_kind='FEE' OR r.source_key LIKE 'monthly:%')
      AND r.due_date < (now() at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date
      AND r.amount-r.cancelled_amount-coalesce(applied.amount,0)>0)::integer overdue_installments
  FROM miclub.enrollments e
  JOIN miclub.clubs c ON c.id=e.club_id
  LEFT JOIN miclub.receivables r ON r.club_id=e.club_id AND r.enrollment_id=e.id
  LEFT JOIN LATERAL (SELECT sum(a.amount) amount FROM miclub.payment_allocations a
    WHERE a.club_id=r.club_id AND a.receivable_id=r.id) applied ON true
  LEFT JOIN miclub.payment_allocations pa ON pa.club_id=r.club_id AND pa.receivable_id=r.id AND pa.amount>0
  LEFT JOIN miclub.payments pay ON pay.club_id=pa.club_id AND pay.id=pa.payment_id
  GROUP BY e.id,e.club_id,e.status,e.status_override,e.enrollment_date,e.created_at
)
SELECT f.id enrollment_id,f.club_id,f.status stored_status,
  CASE WHEN f.status_override OR f.status IN ('abandonado','cancelado') THEN f.status
    WHEN f.today <= f.enrollment_date+10 THEN 'nuevo_inscripto'::miclub.enrollment_status
    WHEN f.has_due_debt THEN 'adeudando'::miclub.enrollment_status
    ELSE 'al_dia'::miclub.enrollment_status END effective_status,
  f.payment_last_payment_at last_payment_at,
  f.first_fee_due due_date,
  f.overdue_installments,
  f.status_override
FROM facts f;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub'
     AND table_name='receivables' AND column_name='charge_kind') OR
     NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='miclub'
     AND table_name='movements' AND column_name='counterparty_document_value') THEN
    RAISE EXCEPTION 'POST_VALIDATION_FAILED';
  END IF;
END $$;
COMMIT;

-- Post-validación de lectura: deben verse las cuatro columnas nuevas de cargos,
-- las dos de contraparte y la vista de estado operativo.
SELECT table_name,column_name FROM information_schema.columns
WHERE table_schema='miclub' AND (
  table_name='receivables' AND column_name IN ('charge_kind','period_start','period_end','price_term_id') OR
  table_name='movements' AND column_name IN ('counterparty_document_type','counterparty_document_value'))
ORDER BY table_name,column_name;
SELECT to_regclass('miclub.v_enrollment_lifecycle_v2') AS enrollment_lifecycle_view;

-- Rollback: si todavía no se registró ninguna operación con este esquema,
-- restaurar el backup verificado. Tras el primer cargo/cobro nuevo, conservar
-- historia financiera y preparar una migración compensatoria revisada; no
-- borrar columnas ni revertir cargos por SQL ad hoc.
