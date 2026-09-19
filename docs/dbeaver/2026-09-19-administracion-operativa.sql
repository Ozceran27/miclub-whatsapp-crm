-- miClub Gestión — configuración operativa desde Administración
-- EJECUCIÓN MANUAL EXCLUSIVA EN DBEAVER. No ejecutar contra producción sin backup restaurable.
-- ESTE ES EL ÚNICO ARCHIVO QUE DEBE EJECUTARSE EN EL FLUJO MANUAL.
-- No ejecutar antes ni después apps/api/db/migrations/202609190001_administration_configuration.sql:
-- esa migración es la fuente canónica para el runner automatizado y su DDL ya está incorporado aquí.
-- Si el ledger ya contiene 202609190001_administration_configuration.sql con el checksum esperado,
-- detenerse y no volver a aplicar este script; continuar directamente con las validaciones operativas.
-- Ejecutar el archivo completo con "Execute SQL Script" de DBeaver para conservar BEGIN/COMMIT.
-- Este script no modifica datos financieros históricos: sólo normaliza sectores de forma
-- determinística y aborta si encuentra responsables históricos ambiguos.

SELECT current_user AS execution_user,current_database() AS database,current_schema() AS schema;
SHOW transaction_read_only;
SELECT to_regnamespace('miclub') AS miclub_schema,to_regclass('public.miclub_schema_migrations') AS migration_ledger;

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('miclub.dbeaver.2026-09-19-administracion-operativa'));

DO $preconditions$
BEGIN
  IF current_setting('transaction_read_only')='on' THEN RAISE EXCEPTION 'PRECONDICION: la conexión es read-only'; END IF;
  IF to_regnamespace('miclub') IS NULL OR to_regclass('public.miclub_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION: faltan schema miclub o ledger público';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='miclub_runtime')
     OR NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='btree_gist')
     OR to_regprocedure('miclub.finance_capture_change()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION: faltan rol runtime, btree_gist o función de auditoría financiera';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609090003_initial_obligation_applications.sql' AND checksum='b7e6f505f03e11c9cb1a7539c2585cb05feb81f400c9195e0c7c9da02ede458d') THEN
    RAISE EXCEPTION 'PRECONDICION: falta el circuito financiero 202609090003 con checksum canónico';
  END IF;
  IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609190001_administration_configuration.sql' AND checksum<>'c1002a3a9451f008bf59bd0245db3c9991f86ed878ea383ae77af10d6e18035e') THEN
    RAISE EXCEPTION 'PRECONDICION: existe 202609190001 con checksum incompatible';
  END IF;
  IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609190001_administration_configuration.sql' AND checksum='c1002a3a9451f008bf59bd0245db3c9991f86ed878ea383ae77af10d6e18035e') THEN
    RAISE EXCEPTION 'YA APLICADA: 202609190001 ya figura en el ledger con el checksum canónico; no volver a ejecutar';
  END IF;
  IF to_regclass('miclub.activity_settlements') IS NULL OR to_regclass('miclub.finance_history') IS NULL OR to_regclass('miclub.employees') IS NULL OR to_regclass('miclub.employee_photos') IS NULL THEN
    RAISE EXCEPTION 'PRECONDICION: faltan tablas requeridas del circuito financiero';
  END IF;
  IF EXISTS(SELECT 1 FROM miclub.activities WHERE archived_at IS NULL AND instructor_id IS NULL) THEN
    RAISE EXCEPTION 'AMBIGUEDAD: existen actividades vigentes sin instructor; corregirlas antes de migrar';
  END IF;
  IF EXISTS(SELECT 1 FROM miclub.activity_terms WHERE responsible_person_id IS NULL) THEN
    RAISE EXCEPTION 'AMBIGUEDAD: existen términos históricos sin receptor económico; no se infieren automáticamente';
  END IF;
END
$preconditions$;

GRANT SELECT,INSERT,UPDATE,DELETE ON miclub.employee_photos TO miclub_runtime;

UPDATE miclub.sectors SET status=CASE operational_status::text WHEN 'activa' THEN 'active' WHEN 'suspendida' THEN 'inactive' WHEN 'cancelada' THEN 'archived' ELSE 'active' END WHERE status IS NULL;
ALTER TABLE miclub.sectors ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE miclub.sectors ALTER COLUMN status SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sectors_club_code_ci_uk ON miclub.sectors(club_id,lower(code));
ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_new_writes_require_instructor;
ALTER TABLE miclub.activities ADD CONSTRAINT activities_new_writes_require_instructor CHECK(archived_at IS NOT NULL OR instructor_id IS NOT NULL) NOT VALID;
ALTER TABLE miclub.activity_terms DROP CONSTRAINT IF EXISTS activity_terms_new_writes_require_responsible;
ALTER TABLE miclub.activity_terms ADD CONSTRAINT activity_terms_new_writes_require_responsible CHECK(responsible_person_id IS NOT NULL) NOT VALID;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='miclub.employees'::regclass AND conname='employees_id_club_key') THEN ALTER TABLE miclub.employees ADD CONSTRAINT employees_id_club_key UNIQUE(id,club_id); END IF; END $$;

CREATE TABLE IF NOT EXISTS miclub.employee_compensation_terms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES miclub.clubs(id),employee_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),currency_code text NOT NULL REFERENCES miclub.currencies(code),
 frequency text NOT NULL CHECK(frequency IN('DAILY','WEEKLY','MONTHLY','YEARLY')),effective_from date NOT NULL,effective_to date,
 revision integer NOT NULL DEFAULT 1,created_by uuid REFERENCES miclub.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(employee_id,club_id) REFERENCES miclub.employees(id,club_id),CHECK(effective_to IS NULL OR effective_to>=effective_from),UNIQUE(id,club_id));
CREATE UNIQUE INDEX IF NOT EXISTS employee_compensation_terms_current_uk ON miclub.employee_compensation_terms(club_id,employee_id) WHERE effective_to IS NULL;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='miclub.employee_compensation_terms'::regclass AND conname='employee_compensation_terms_no_overlap') THEN ALTER TABLE miclub.employee_compensation_terms ADD CONSTRAINT employee_compensation_terms_no_overlap EXCLUDE USING gist(club_id WITH =,employee_id WITH =,daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') WITH &&); END IF; END $$;

CREATE TABLE IF NOT EXISTS miclub.employee_compensation_obligations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES miclub.clubs(id),term_id uuid NOT NULL,employee_id uuid NOT NULL,person_id uuid NOT NULL,sector_id uuid,
 period_from date NOT NULL,period_to date NOT NULL,due_date date NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount>=0),currency_code text NOT NULL REFERENCES miclub.currencies(code),
 review_state text NOT NULL DEFAULT 'DRAFT' CHECK(review_state IN('DRAFT','APPROVED','REQUIRES_REVIEW','CANCELLED')),revision integer NOT NULL DEFAULT 1,snapshot jsonb NOT NULL,
 reviewed_by uuid REFERENCES miclub.users(id),reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(term_id,club_id) REFERENCES miclub.employee_compensation_terms(id,club_id),FOREIGN KEY(employee_id,club_id) REFERENCES miclub.employees(id,club_id),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),FOREIGN KEY(sector_id,club_id) REFERENCES miclub.sectors(id,club_id),
 CHECK(period_to>=period_from),UNIQUE(term_id,period_from,period_to),UNIQUE(id,club_id));

CREATE TABLE IF NOT EXISTS miclub.employee_compensation_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES miclub.clubs(id),obligation_id uuid NOT NULL,movement_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0),status text NOT NULL DEFAULT 'COMPLETADO' CHECK(status IN('PENDIENTE','COMPLETADO','CANCELADO')),
 created_at timestamptz NOT NULL DEFAULT now(),voided_at timestamptz,voided_by uuid REFERENCES miclub.users(id),void_reason text,
 FOREIGN KEY(obligation_id,club_id) REFERENCES miclub.employee_compensation_obligations(id,club_id),FOREIGN KEY(movement_id,club_id) REFERENCES miclub.movements(id,club_id),UNIQUE(club_id,movement_id));

CREATE TABLE IF NOT EXISTS miclub.activity_settlement_adjustments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES miclub.clubs(id),settlement_id uuid NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount<>0),
 revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','VOIDED')),reason text NOT NULL CHECK(nullif(btrim(reason),'') IS NOT NULL),
 created_by uuid NOT NULL REFERENCES miclub.users(id),created_at timestamptz NOT NULL DEFAULT now(),voided_at timestamptz,voided_by uuid REFERENCES miclub.users(id),void_reason text,
 FOREIGN KEY(settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id));
CREATE INDEX IF NOT EXISTS activity_settlement_adjustments_active_idx ON miclub.activity_settlement_adjustments(club_id,settlement_id) WHERE status='ACTIVE';

ALTER TABLE miclub.settlement_compensations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','VOIDED'));
ALTER TABLE miclub.settlement_compensations ADD COLUMN IF NOT EXISTS payout_group_id uuid;
ALTER TABLE miclub.settlement_compensations ADD COLUMN IF NOT EXISTS credit_employee_compensation_obligation_id uuid;
ALTER TABLE miclub.settlement_compensations ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE miclub.settlement_compensations ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES miclub.users(id);
ALTER TABLE miclub.settlement_compensations ADD COLUMN IF NOT EXISTS void_reason text;
DO $$ BEGIN
 ALTER TABLE miclub.settlement_compensations DROP CONSTRAINT IF EXISTS compensation_exact_credit_source;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='miclub.settlement_compensations'::regclass AND conname='compensation_credit_employee_tenant_fk') THEN ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_credit_employee_tenant_fk FOREIGN KEY(credit_employee_compensation_obligation_id,club_id) REFERENCES miclub.employee_compensation_obligations(id,club_id); END IF;
 ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_exact_credit_source CHECK(num_nonnulls(credit_settlement_id,credit_initial_obligation_id,credit_employee_compensation_obligation_id)=1);
END $$;

CREATE TABLE IF NOT EXISTS miclub.payout_groups(
 id uuid PRIMARY KEY,club_id uuid NOT NULL REFERENCES miclub.clubs(id),person_id uuid NOT NULL,currency_code text NOT NULL REFERENCES miclub.currencies(code),
 direction text NOT NULL CHECK(direction IN('PAY','COLLECT')),amount numeric(14,2) NOT NULL CHECK(amount>0),status text NOT NULL DEFAULT 'COMPLETED' CHECK(status IN('COMPLETED','VOIDED')),
 reason text NOT NULL,created_by uuid NOT NULL REFERENCES miclub.users(id),created_at timestamptz NOT NULL DEFAULT now(),voided_at timestamptz,voided_by uuid REFERENCES miclub.users(id),void_reason text,
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),UNIQUE(id,club_id));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='miclub.settlement_compensations'::regclass AND conname='settlement_compensations_payout_group_fk') THEN ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT settlement_compensations_payout_group_fk FOREIGN KEY(payout_group_id,club_id) REFERENCES miclub.payout_groups(id,club_id); END IF; END $$;

CREATE TABLE IF NOT EXISTS miclub.opening_balance_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES miclub.clubs(id),operation_key text NOT NULL,previous_snapshot jsonb,replacement_snapshot jsonb NOT NULL,
 reason text NOT NULL,actor_id uuid NOT NULL REFERENCES miclub.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(club_id,operation_key));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['employee_compensation_terms','employee_compensation_obligations','employee_compensation_allocations','activity_settlement_adjustments','payout_groups','opening_balance_revisions'] LOOP
  EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE miclub.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON miclub.%I',t);
  EXECUTE format('CREATE POLICY tenant_scope ON miclub.%I USING(club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid) WITH CHECK(club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON miclub.%I TO miclub_runtime',t);
 END LOOP;
END $$;

DROP TRIGGER IF EXISTS capture_employee_compensation_terms_history ON miclub.employee_compensation_terms;
CREATE TRIGGER capture_employee_compensation_terms_history BEFORE UPDATE ON miclub.employee_compensation_terms FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DROP TRIGGER IF EXISTS capture_employee_compensation_obligations_history ON miclub.employee_compensation_obligations;
CREATE TRIGGER capture_employee_compensation_obligations_history BEFORE UPDATE ON miclub.employee_compensation_obligations FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DROP TRIGGER IF EXISTS capture_activity_settlement_adjustments_history ON miclub.activity_settlement_adjustments;
CREATE TRIGGER capture_activity_settlement_adjustments_history BEFORE UPDATE ON miclub.activity_settlement_adjustments FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DROP TRIGGER IF EXISTS capture_payout_groups_history ON miclub.payout_groups;
CREATE TRIGGER capture_payout_groups_history BEFORE UPDATE ON miclub.payout_groups FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();

ALTER TABLE miclub.activities VALIDATE CONSTRAINT activities_new_writes_require_instructor;
ALTER TABLE miclub.activity_terms VALIDATE CONSTRAINT activity_terms_new_writes_require_responsible;
INSERT INTO public.miclub_schema_migrations(name,checksum)
VALUES('202609190001_administration_configuration.sql','c1002a3a9451f008bf59bd0245db3c9991f86ed878ea383ae77af10d6e18035e')
ON CONFLICT(name) DO UPDATE SET checksum=excluded.checksum WHERE public.miclub_schema_migrations.checksum=excluded.checksum;

COMMIT;

-- Validación posterior: todas las filas deben devolver PASS/0 según su etiqueta.
SELECT name,checksum FROM public.miclub_schema_migrations WHERE name='202609190001_administration_configuration.sql';
SELECT to_regclass('miclub.employee_compensation_terms') IS NOT NULL AS compensation_terms_ok,
       to_regclass('miclub.employee_compensation_obligations') IS NOT NULL AS compensation_obligations_ok,
       to_regclass('miclub.payout_groups') IS NOT NULL AS payout_groups_ok,
       to_regclass('miclub.opening_balance_revisions') IS NOT NULL AS opening_revisions_ok;
SELECT count(*) AS activities_without_instructor FROM miclub.activities WHERE archived_at IS NULL AND instructor_id IS NULL;
SELECT count(*) AS terms_without_responsible FROM miclub.activity_terms WHERE responsible_person_id IS NULL;
SELECT c.conname,c.convalidated FROM pg_constraint c WHERE c.conrelid IN('miclub.activities'::regclass,'miclub.activity_terms'::regclass) AND c.conname IN('activities_new_writes_require_instructor','activity_terms_new_writes_require_responsible');
SELECT tablename,policyname FROM pg_policies WHERE schemaname='miclub' AND tablename IN('employee_compensation_terms','employee_compensation_obligations','employee_compensation_allocations','activity_settlement_adjustments','payout_groups','opening_balance_revisions') ORDER BY tablename;

-- ROLLBACK CONDICIONAL (NO ejecutar después de uso funcional): abrir una nueva
-- transacción, bloquear con la misma advisory key y abortar si cualquiera de las
-- seis tablas contiene filas o si existen columnas nuevas de settlement_compensations
-- referenciadas. Sólo entonces eliminar triggers/policies/tablas en orden inverso,
-- quitar constraints nuevas y borrar la fila del ledger. El rollback destructivo
-- queda deliberadamente comentado: con datos nuevos la reversión soportada es una
-- migración forward correctiva, no DROP manual.
