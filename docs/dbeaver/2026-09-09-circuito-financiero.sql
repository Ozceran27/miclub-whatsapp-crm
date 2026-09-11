-- Ejecutar completo en DBeaver, como propietario del schema, con backup verificado.
-- Si la sesión quedó abortada por un intento anterior, ejecutar ROLLBACK primero.
-- Antes del COMMIT: ROLLBACK revierte todo. Tras registrar operaciones: reversión
-- mediante ajustes auditados; no borrar tablas ni historia financiera.
SELECT current_database(),current_user;
BEGIN;
SELECT pg_advisory_xact_lock(817320260908);
-- Schema de comparación vacío y transaccional; jamás contiene datos del club.
CREATE SCHEMA financial_install_probe;
DO $install$
BEGIN
 IF to_regclass('public.miclub_schema_migrations') IS NULL THEN RAISE EXCEPTION 'Falta ledger canónico'; END IF;
 IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609090002_financial_operating_circuit.sql' AND checksum<>'8ca524bc9c99e85e1118f7df828c98c8f12e572d29c6dabf32e8f7a0fcfdbfdd') THEN RAISE EXCEPTION 'Checksum incompatible: 202609090002_financial_operating_circuit.sql'; END IF;
 -- Recuperación compatible: valida objetos existentes y completa los faltantes.
 EXECUTE $migration$DO $$ BEGIN
 IF to_regclass('miclub.activity_terms') IS NULL OR to_regclass('miclub.payment_allocations') IS NULL
 THEN RAISE EXCEPTION 'Missing financial prerequisites'; END IF;
END $$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_terms'::regclass AND attname='responsible_person_id' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_terms ADD COLUMN responsible_person_id uuid;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_terms);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN responsible_person_id;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN responsible_person_id uuid;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_terms'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_terms.responsible_person_id. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_terms'::regclass AND attname='partial_month_policy' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_terms ADD COLUMN partial_month_policy text CHECK (partial_month_policy IN ('CALENDAR_DAYS','FULL_MONTH'));
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_terms);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN partial_month_policy;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN partial_month_policy text CHECK (partial_month_policy IN ('CALENDAR_DAYS','FULL_MONTH'));
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_terms'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_terms.partial_month_policy. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_terms'::regclass AND attname='revision' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_terms ADD COLUMN revision integer NOT NULL DEFAULT 1;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_terms);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN revision;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN revision integer NOT NULL DEFAULT 1;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_terms'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_terms.revision. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.activity_terms);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT activity_terms_responsible_tenant_fk FOREIGN KEY (responsible_person_id,club_id) REFERENCES miclub.people(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='activity_terms_responsible_tenant_fk';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.activity_terms'::regclass AND conname='activity_terms_responsible_tenant_fk';
 IF actual IS NULL THEN ALTER TABLE miclub.activity_terms ADD CONSTRAINT activity_terms_responsible_tenant_fk FOREIGN KEY (responsible_person_id,club_id) REFERENCES miclub.people(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.activity_terms.activity_terms_responsible_tenant_fk'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.activity_terms);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT activity_terms_id_club_key UNIQUE(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='activity_terms_id_club_key';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.activity_terms'::regclass AND conname='activity_terms_id_club_key';
 IF actual IS NULL THEN ALTER TABLE miclub.activity_terms ADD CONSTRAINT activity_terms_id_club_key UNIQUE(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.activity_terms.activity_terms_id_club_key'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
ALTER TABLE miclub.activity_settlements DROP CONSTRAINT IF EXISTS activity_settlements_activity_id_period_from_period_to_key;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='circuit_version' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN circuit_version integer;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN circuit_version;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN circuit_version integer;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.circuit_version. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='review_state' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN review_state text NOT NULL DEFAULT 'DRAFT' CHECK (review_state IN ('DRAFT','APPROVED','REQUIRES_REVIEW'));
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN review_state;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN review_state text NOT NULL DEFAULT 'DRAFT' CHECK (review_state IN ('DRAFT','APPROVED','REQUIRES_REVIEW'));
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.review_state. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='revision' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN revision integer NOT NULL DEFAULT 1;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN revision;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN revision integer NOT NULL DEFAULT 1;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.revision. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='calculation' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN calculation jsonb;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN calculation;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN calculation jsonb;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.calculation. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='calculation_hash' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN calculation_hash text;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN calculation_hash;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN calculation_hash text;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.calculation_hash. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='closed_at' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN closed_at timestamptz;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN closed_at;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN closed_at timestamptz;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.closed_at. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.activity_settlements'::regclass AND attname='reviewed_by' AND NOT attisdropped) THEN
  ALTER TABLE miclub.activity_settlements ADD COLUMN reviewed_by uuid REFERENCES miclub.users(id);
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.activity_settlements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN reviewed_by;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN reviewed_by uuid REFERENCES miclub.users(id);
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.activity_settlements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.activity_settlements.reviewed_by. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.activity_settlements);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT activity_settlements_term_period_key UNIQUE(activity_term_id,period_from,period_to);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='activity_settlements_term_period_key';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.activity_settlements'::regclass AND conname='activity_settlements_term_period_key';
 IF actual IS NULL THEN ALTER TABLE miclub.activity_settlements ADD CONSTRAINT activity_settlements_term_period_key UNIQUE(activity_term_id,period_from,period_to);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.activity_settlements.activity_settlements_term_period_key'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.receivables);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT receivables_id_club_key UNIQUE(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='receivables_id_club_key';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.receivables'::regclass AND conname='receivables_id_club_key';
 IF actual IS NULL THEN ALTER TABLE miclub.receivables ADD CONSTRAINT receivables_id_club_key UNIQUE(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.receivables.receivables_id_club_key'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.movements'::regclass AND attname='revision' AND NOT attisdropped) THEN
  ALTER TABLE miclub.movements ADD COLUMN revision integer NOT NULL DEFAULT 1;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.movements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN revision;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN revision integer NOT NULL DEFAULT 1;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.movements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.movements.revision. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.movements'::regclass AND attname='receivable_id' AND NOT attisdropped) THEN
  ALTER TABLE miclub.movements ADD COLUMN receivable_id uuid;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.movements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN receivable_id;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN receivable_id uuid;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.movements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.movements.receivable_id. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.movements'::regclass AND attname='payout_group_id' AND NOT attisdropped) THEN
  ALTER TABLE miclub.movements ADD COLUMN payout_group_id uuid;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.movements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN payout_group_id;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN payout_group_id uuid;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.movements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.movements.payout_group_id. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.movements);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT movements_receivable_tenant_fk FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='movements_receivable_tenant_fk';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.movements'::regclass AND conname='movements_receivable_tenant_fk';
 IF actual IS NULL THEN ALTER TABLE miclub.movements ADD CONSTRAINT movements_receivable_tenant_fk FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.movements.movements_receivable_tenant_fk'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.receivables'::regclass AND attname='cancelled_amount' AND NOT attisdropped) THEN
  ALTER TABLE miclub.receivables ADD COLUMN cancelled_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(cancelled_amount>=0 AND cancelled_amount<=amount);
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.receivables);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN cancelled_amount;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN cancelled_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(cancelled_amount>=0 AND cancelled_amount<=amount);
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.receivables'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.receivables.cancelled_amount. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.receivables'::regclass AND attname='currency_code' AND NOT attisdropped) THEN
  ALTER TABLE miclub.receivables ADD COLUMN currency_code text NOT NULL DEFAULT 'ARS' REFERENCES miclub.currencies(code);
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.receivables);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN currency_code;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN currency_code text NOT NULL DEFAULT 'ARS' REFERENCES miclub.currencies(code);
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.receivables'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.receivables.currency_code. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.receivables'::regclass AND attname='source_key' AND NOT attisdropped) THEN
  ALTER TABLE miclub.receivables ADD COLUMN source_key text;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.receivables);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN source_key;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN source_key text;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.receivables'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.receivables.source_key. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
CREATE UNIQUE INDEX IF NOT EXISTS receivables_source_key_unique ON miclub.receivables(club_id,source_key) WHERE source_key IS NOT NULL;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.enrollments'::regclass AND attname='debt_on_exit' AND NOT attisdropped) THEN
  ALTER TABLE miclub.enrollments ADD COLUMN debt_on_exit text CHECK(debt_on_exit IN ('KEEP','FORGIVE'));
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.enrollments);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN debt_on_exit;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN debt_on_exit text CHECK(debt_on_exit IN ('KEEP','FORGIVE'));
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.enrollments'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.enrollments.debt_on_exit. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.finance_operations (
 club_id uuid NOT NULL REFERENCES miclub.clubs(id), operation_key text NOT NULL,
 request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(club_id,operation_key)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 club_id uuid NOT NULL REFERENCES miclub.clubs(id), operation_key text NOT NULL,
 request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(club_id,operation_key)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.finance_operations'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.finance_operations'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.finance_operations'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.finance_operations'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.finance_operations'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.finance_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 entity_type text NOT NULL, entity_id uuid NOT NULL, before_data jsonb, after_data jsonb,
 actor_id uuid REFERENCES miclub.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 entity_type text NOT NULL, entity_id uuid NOT NULL, before_data jsonb, after_data jsonb,
 actor_id uuid REFERENCES miclub.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.finance_history'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.finance_history'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.finance_history'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.finance_history'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.finance_history'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE INDEX IF NOT EXISTS finance_history_entity_idx ON miclub.finance_history(club_id,entity_type,entity_id,created_at);
CREATE TABLE IF NOT EXISTS miclub.settlement_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 settlement_id uuid NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES miclub.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id), UNIQUE(settlement_id,revision)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 settlement_id uuid NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES miclub.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id), UNIQUE(settlement_id,revision)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.settlement_reviews'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.settlement_reviews'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.settlement_reviews'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.settlement_reviews'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.settlement_reviews'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.fixed_fee_distributions (
 club_id uuid NOT NULL, activity_term_id uuid NOT NULL,
 month date NOT NULL CHECK(extract(day FROM month)=1), amount numeric(14,2) NOT NULL CHECK(amount>=0),
 PRIMARY KEY(club_id,activity_term_id,month),
 FOREIGN KEY(activity_term_id,club_id) REFERENCES miclub.activity_terms(id,club_id)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 club_id uuid NOT NULL, activity_term_id uuid NOT NULL,
 month date NOT NULL CHECK(extract(day FROM month)=1), amount numeric(14,2) NOT NULL CHECK(amount>=0),
 PRIMARY KEY(club_id,activity_term_id,month),
 FOREIGN KEY(activity_term_id,club_id) REFERENCES miclub.activity_terms(id,club_id)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.fixed_fee_distributions'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.fixed_fee_distributions'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.fixed_fee_distributions'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.fixed_fee_distributions'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.fixed_fee_distributions'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.movement_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 original_movement_id uuid NOT NULL, refund_movement_id uuid NOT NULL,
 original_term_id uuid, responsible_amount numeric(14,2) NOT NULL CHECK(responsible_amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(original_term_id,club_id) REFERENCES miclub.activity_terms(id,club_id),
 FOREIGN KEY(original_movement_id,club_id) REFERENCES miclub.movements(id,club_id),
 FOREIGN KEY(refund_movement_id,club_id) REFERENCES miclub.movements(id,club_id), UNIQUE(club_id,refund_movement_id)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 original_movement_id uuid NOT NULL, refund_movement_id uuid NOT NULL,
 original_term_id uuid, responsible_amount numeric(14,2) NOT NULL CHECK(responsible_amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(original_term_id,club_id) REFERENCES miclub.activity_terms(id,club_id),
 FOREIGN KEY(original_movement_id,club_id) REFERENCES miclub.movements(id,club_id),
 FOREIGN KEY(refund_movement_id,club_id) REFERENCES miclub.movements(id,club_id), UNIQUE(club_id,refund_movement_id)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.movement_refunds'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.movement_refunds'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.movement_refunds'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.movement_refunds'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.movement_refunds'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.settlement_compensations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 person_id uuid NOT NULL, currency_code text NOT NULL REFERENCES miclub.currencies(code),
 debt_settlement_id uuid NOT NULL, credit_settlement_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),
 FOREIGN KEY(debt_settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id),
 FOREIGN KEY(credit_settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 person_id uuid NOT NULL, currency_code text NOT NULL REFERENCES miclub.currencies(code),
 debt_settlement_id uuid NOT NULL, credit_settlement_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),
 FOREIGN KEY(debt_settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id),
 FOREIGN KEY(credit_settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.settlement_compensations'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.settlement_compensations'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.settlement_compensations'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.settlement_compensations'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.settlement_compensations'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.finance_startups (
 club_id uuid PRIMARY KEY REFERENCES miclub.clubs(id), mode text NOT NULL CHECK(mode IN ('RECONSTRUCTION','CUTOFF')),
 cutoff_date date NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REQUIRES_REVIEW')),
 revision integer NOT NULL DEFAULT 1, expected_balances jsonb NOT NULL DEFAULT '[]', approved_snapshot jsonb,
 approved_by uuid REFERENCES miclub.users(id), approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 club_id uuid PRIMARY KEY REFERENCES miclub.clubs(id), mode text NOT NULL CHECK(mode IN ('RECONSTRUCTION','CUTOFF')),
 cutoff_date date NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REQUIRES_REVIEW')),
 revision integer NOT NULL DEFAULT 1, expected_balances jsonb NOT NULL DEFAULT '[]', approved_snapshot jsonb,
 approved_by uuid REFERENCES miclub.users(id), approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.finance_startups'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.finance_startups'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.finance_startups'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.finance_startups'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.finance_startups'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.initial_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 person_id uuid NOT NULL, activity_id uuid, kind text NOT NULL CHECK(kind IN ('STUDENT','RESPONSIBLE','EMPLOYEE','SUPPLIER')),
 currency_code text NOT NULL REFERENCES miclub.currencies(code), amount numeric(14,2) NOT NULL,
 settled_amount numeric(14,2) NOT NULL DEFAULT 0, source_key text NOT NULL, due_date date NOT NULL,
 receivable_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),
 FOREIGN KEY(activity_id,club_id) REFERENCES miclub.activities(id,club_id),
 FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id), UNIQUE(club_id,source_key)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 person_id uuid NOT NULL, activity_id uuid, kind text NOT NULL CHECK(kind IN ('STUDENT','RESPONSIBLE','EMPLOYEE','SUPPLIER')),
 currency_code text NOT NULL REFERENCES miclub.currencies(code), amount numeric(14,2) NOT NULL,
 settled_amount numeric(14,2) NOT NULL DEFAULT 0, source_key text NOT NULL, due_date date NOT NULL,
 receivable_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),
 FOREIGN KEY(activity_id,club_id) REFERENCES miclub.activities(id,club_id),
 FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id), UNIQUE(club_id,source_key)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.initial_obligations'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.initial_obligations'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.initial_obligations'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.initial_obligations'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.initial_obligations'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
CREATE OR REPLACE FUNCTION miclub.finance_lock(p_club uuid) RETURNS void LANGUAGE sql AS $$
 SELECT pg_advisory_xact_lock(hashtextextended(p_club::text,17017));
$$;
CREATE OR REPLACE FUNCTION miclub.finance_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; reason text;
BEGIN
 PERFORM miclub.finance_lock(NEW.club_id);
 actor := nullif(current_setting('app.finance_actor',true),'')::uuid;
 reason := coalesce(nullif(current_setting('app.finance_reason',true),''),'Operación registrada por el sistema');
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN ('movements','activity_terms') THEN NEW.revision:=OLD.revision+1; END IF;
  INSERT INTO miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason)
  VALUES(NEW.club_id,TG_TABLE_NAME,NEW.id,to_jsonb(OLD),to_jsonb(NEW),actor,reason);
  IF TG_TABLE_NAME='movements' THEN
   IF OLD.reconciled_at IS NOT NULL THEN NEW.reconciled_at:=NULL; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_movements_history ON miclub.movements;
CREATE TRIGGER finance_movements_history BEFORE INSERT OR UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DROP TRIGGER IF EXISTS finance_terms_history ON miclub.activity_terms;
CREATE TRIGGER finance_terms_history BEFORE INSERT OR UPDATE ON miclub.activity_terms FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DROP TRIGGER IF EXISTS finance_payments_history ON miclub.payments;
CREATE TRIGGER finance_payments_history BEFORE INSERT OR UPDATE ON miclub.payments FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DROP TRIGGER IF EXISTS finance_receivables_history ON miclub.receivables;
CREATE TRIGGER finance_receivables_history BEFORE INSERT OR UPDATE ON miclub.receivables FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
CREATE OR REPLACE FUNCTION miclub.protect_finalized_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.reconciled_at IS NOT NULL OR miclub.movement_has_payment_allocation(OLD.id))
 AND nullif(current_setting('app.finance_reason',true),'') IS NULL THEN
  RAISE EXCEPTION 'Use the authorized coordinated financial correction';
 END IF;
 IF NEW.id<>OLD.id OR NEW.club_id<>OLD.club_id OR NEW.source IS DISTINCT FROM OLD.source
 OR NEW.external_id IS DISTINCT FROM OLD.external_id OR NEW.source_payload IS DISTINCT FROM OLD.source_payload THEN
  RAISE EXCEPTION 'Financial identity and origin are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION miclub.finance_term_responsible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.responsible_person_id IS NULL THEN
  SELECT i.person_id INTO NEW.responsible_person_id FROM miclub.activities a
  JOIN miclub.instructors i ON i.id=a.instructor_id AND i.club_id=a.club_id
  WHERE a.id=NEW.activity_id AND a.club_id=NEW.club_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_term_new_responsible ON miclub.activity_terms;
CREATE TRIGGER finance_term_new_responsible BEFORE INSERT ON miclub.activity_terms FOR EACH ROW EXECUTE FUNCTION miclub.finance_term_responsible();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_operations','finance_history','settlement_reviews','fixed_fee_distributions','movement_refunds','settlement_compensations','finance_startups','initial_obligations'] LOOP
  EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE miclub.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_scope ON miclub.%I',t);
  EXECUTE format('CREATE POLICY tenant_scope ON miclub.%I USING(club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid) WITH CHECK(club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON miclub.%I TO miclub_runtime',t);
 END LOOP;
END $$;
REVOKE UPDATE ON miclub.finance_history,miclub.settlement_reviews FROM miclub_runtime;
CREATE OR REPLACE VIEW miclub.v_financial_account_liquidity AS
 SELECT a.club_id,a.id AS account_id,a.code,a.name,a.currency_code,
 (coalesce((SELECT (x->>'amount')::numeric FROM jsonb_array_elements(st.approved_snapshot->'accounts') x WHERE x->>'accountId'=a.id::text),0)
 + coalesce(sum(CASE WHEN m.movement_type='EGRESOS' THEN -m.amount ELSE m.amount END),0))::numeric(14,2) balance
 FROM miclub.financial_accounts a JOIN miclub.clubs c ON c.id=a.club_id
 LEFT JOIN miclub.finance_startups st ON st.club_id=a.club_id AND st.approved_snapshot IS NOT NULL
 LEFT JOIN miclub.movements m ON m.club_id=a.club_id AND m.account_id=a.id AND m.operational_status='COMPLETADO' AND m.voided_at IS NULL
 AND (st.club_id IS NULL OR ((m.movement_date AT TIME ZONE coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date>st.cutoff_date
 AND NOT EXISTS(SELECT 1 FROM miclub.opening_balance_movements ob WHERE ob.movement_id=m.id)))
 GROUP BY a.club_id,a.id,a.code,a.name,a.currency_code,st.approved_snapshot;
UPDATE miclub.user_club_memberships m SET permissions=(SELECT array_agg(DISTINCT p) FROM unnest(m.permissions || ARRAY['finance.review','finance.pay','finance.correct','finance.reconcile']) p)
FROM miclub.roles r WHERE r.id=m.role_id AND r.club_id=m.club_id AND r.code IN ('DIRECTOR','owner','admin');$migration$;
 IF NOT EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609090002_financial_operating_circuit.sql') THEN
  INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('202609090002_financial_operating_circuit.sql','8ca524bc9c99e85e1118f7df828c98c8f12e572d29c6dabf32e8f7a0fcfdbfdd');
 END IF;
IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609090003_initial_obligation_applications.sql' AND checksum<>'b7e6f505f03e11c9cb1a7539c2585cb05feb81f400c9195e0c7c9da02ede458d') THEN RAISE EXCEPTION 'Checksum incompatible: 202609090003_initial_obligation_applications.sql'; END IF;
 -- Recuperación compatible: valida objetos existentes y completa los faltantes.
 EXECUTE $migration$ALTER TABLE miclub.xlsx_import_rows DROP CONSTRAINT IF EXISTS xlsx_import_rows_sheet_check;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.xlsx_import_rows);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT xlsx_import_rows_sheet_check
 CHECK (sheet IN ('ADMINISTRACIÓN','INSCRIPCIONES','SALDOS_INICIALES'));
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='xlsx_import_rows_sheet_check';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.xlsx_import_rows'::regclass AND conname='xlsx_import_rows_sheet_check';
 IF actual IS NULL THEN ALTER TABLE miclub.xlsx_import_rows ADD CONSTRAINT xlsx_import_rows_sheet_check
 CHECK (sheet IN ('ADMINISTRACIÓN','INSCRIPCIONES','SALDOS_INICIALES'));
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.xlsx_import_rows.xlsx_import_rows_sheet_check'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.initial_obligations);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT initial_obligations_id_club_unique UNIQUE(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='initial_obligations_id_club_unique';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.initial_obligations'::regclass AND conname='initial_obligations_id_club_unique';
 IF actual IS NULL THEN ALTER TABLE miclub.initial_obligations ADD CONSTRAINT initial_obligations_id_club_unique UNIQUE(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.initial_obligations.initial_obligations_id_club_unique'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.initial_obligations'::regclass AND attname='review_state' AND NOT attisdropped) THEN
  ALTER TABLE miclub.initial_obligations ADD COLUMN review_state text NOT NULL DEFAULT 'APPROVED' CHECK(review_state IN ('DRAFT','APPROVED'));
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.initial_obligations);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN review_state;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN review_state text NOT NULL DEFAULT 'APPROVED' CHECK(review_state IN ('DRAFT','APPROVED'));
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.initial_obligations'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.initial_obligations.review_state. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.movements'::regclass AND attname='initial_obligation_id' AND NOT attisdropped) THEN
  ALTER TABLE miclub.movements ADD COLUMN initial_obligation_id uuid;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.movements);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN initial_obligation_id;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN initial_obligation_id uuid;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.movements'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.movements.initial_obligation_id. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.movements);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT movement_initial_obligation_tenant_fk
 FOREIGN KEY(initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='movement_initial_obligation_tenant_fk';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.movements'::regclass AND conname='movement_initial_obligation_tenant_fk';
 IF actual IS NULL THEN ALTER TABLE miclub.movements ADD CONSTRAINT movement_initial_obligation_tenant_fk
 FOREIGN KEY(initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.movements.movement_initial_obligation_tenant_fk'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
ALTER TABLE miclub.settlement_compensations ALTER COLUMN debt_settlement_id DROP NOT NULL;
ALTER TABLE miclub.settlement_compensations ALTER COLUMN credit_settlement_id DROP NOT NULL;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.settlement_compensations'::regclass AND attname='debt_initial_obligation_id' AND NOT attisdropped) THEN
  ALTER TABLE miclub.settlement_compensations ADD COLUMN debt_initial_obligation_id uuid;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.settlement_compensations);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN debt_initial_obligation_id;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN debt_initial_obligation_id uuid;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.settlement_compensations'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.settlement_compensations.debt_initial_obligation_id. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.settlement_compensations'::regclass AND attname='credit_initial_obligation_id' AND NOT attisdropped) THEN
  ALTER TABLE miclub.settlement_compensations ADD COLUMN credit_initial_obligation_id uuid;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.settlement_compensations);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN credit_initial_obligation_id;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN credit_initial_obligation_id uuid;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.settlement_compensations'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.settlement_compensations.credit_initial_obligation_id. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.settlement_compensations);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT compensation_debt_initial_tenant_fk
 FOREIGN KEY(debt_initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='compensation_debt_initial_tenant_fk';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.settlement_compensations'::regclass AND conname='compensation_debt_initial_tenant_fk';
 IF actual IS NULL THEN ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_debt_initial_tenant_fk
 FOREIGN KEY(debt_initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.settlement_compensations.compensation_debt_initial_tenant_fk'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.settlement_compensations);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT compensation_credit_initial_tenant_fk
 FOREIGN KEY(credit_initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='compensation_credit_initial_tenant_fk';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.settlement_compensations'::regclass AND conname='compensation_credit_initial_tenant_fk';
 IF actual IS NULL THEN ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_credit_initial_tenant_fk
 FOREIGN KEY(credit_initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.settlement_compensations.compensation_credit_initial_tenant_fk'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.settlement_compensations);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT compensation_exact_debt_source
 CHECK(num_nonnulls(debt_settlement_id,debt_initial_obligation_id)=1);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='compensation_exact_debt_source';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.settlement_compensations'::regclass AND conname='compensation_exact_debt_source';
 IF actual IS NULL THEN ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_exact_debt_source
 CHECK(num_nonnulls(debt_settlement_id,debt_initial_obligation_id)=1);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.settlement_compensations.compensation_exact_debt_source'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.settlement_compensations);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT compensation_exact_credit_source
 CHECK(num_nonnulls(credit_settlement_id,credit_initial_obligation_id)=1);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='compensation_exact_credit_source';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.settlement_compensations'::regclass AND conname='compensation_exact_credit_source';
 IF actual IS NULL THEN ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_exact_credit_source
 CHECK(num_nonnulls(credit_settlement_id,credit_initial_obligation_id)=1);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.settlement_compensations.compensation_exact_credit_source'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
DROP TRIGGER IF EXISTS capture_initial_obligation_history ON miclub.initial_obligations;
CREATE TRIGGER capture_initial_obligation_history BEFORE UPDATE ON miclub.initial_obligations
 FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
DO $recover$ DECLARE expected text; actual text; BEGIN
 CREATE TABLE financial_install_probe.finance_constraint_probe (LIKE miclub.payment_allocations);
 ALTER TABLE financial_install_probe.finance_constraint_probe ADD CONSTRAINT payment_allocations_id_club_unique UNIQUE(id,club_id);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='financial_install_probe.finance_constraint_probe'::regclass AND conname='payment_allocations_id_club_unique';
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid='miclub.payment_allocations'::regclass AND conname='payment_allocations_id_club_unique';
 IF actual IS NULL THEN ALTER TABLE miclub.payment_allocations ADD CONSTRAINT payment_allocations_id_club_unique UNIQUE(id,club_id);
 ELSIF actual<>expected THEN RAISE EXCEPTION 'Restricción incompatible: miclub.payment_allocations.payment_allocations_id_club_unique'; END IF;
 DROP TABLE financial_install_probe.finance_constraint_probe;
END $recover$;
CREATE TABLE IF NOT EXISTS miclub.refund_obligation_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 refund_movement_id uuid NOT NULL, payment_allocation_id uuid NOT NULL, receivable_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 FOREIGN KEY(refund_movement_id,club_id) REFERENCES miclub.movements(id,club_id),
 FOREIGN KEY(payment_allocation_id,club_id) REFERENCES miclub.payment_allocations(id,club_id),
 FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id),
 UNIQUE(club_id,refund_movement_id,payment_allocation_id)
);
DO $recover$ BEGIN
 CREATE TABLE financial_install_probe.finance_table_probe (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 refund_movement_id uuid NOT NULL, payment_allocation_id uuid NOT NULL, receivable_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 FOREIGN KEY(refund_movement_id,club_id) REFERENCES miclub.movements(id,club_id),
 FOREIGN KEY(payment_allocation_id,club_id) REFERENCES miclub.payment_allocations(id,club_id),
 FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id),
 UNIQUE(club_id,refund_movement_id,payment_allocation_id)
);
 IF EXISTS(SELECT 1 FROM pg_attribute e LEFT JOIN pg_attribute a ON a.attrelid='miclub.refund_obligation_applications'::regclass AND a.attname=e.attname AND NOT a.attisdropped
 WHERE e.attrelid='financial_install_probe.finance_table_probe'::regclass AND e.attnum>0 AND NOT e.attisdropped
 AND (a.attname IS NULL OR a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR (e.attnotnull AND NOT a.attnotnull AND NOT ('miclub.refund_obligation_applications'='miclub.settlement_compensations' AND e.attname IN ('debt_settlement_id','credit_settlement_id'))))) THEN
 RAISE EXCEPTION 'Tabla incompatible: miclub.refund_obligation_applications'; END IF;
 IF EXISTS(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='financial_install_probe.finance_table_probe'::regclass
 EXCEPT SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE contype<>'n' AND conrelid='miclub.refund_obligation_applications'::regclass) THEN RAISE EXCEPTION 'Restricciones incompletas: miclub.refund_obligation_applications'; END IF;
 DROP TABLE financial_install_probe.finance_table_probe;
END $recover$;
DO $recover$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='miclub.movement_refunds'::regclass AND attname='applications_tracked' AND NOT attisdropped) THEN
  ALTER TABLE miclub.movement_refunds ADD COLUMN applications_tracked boolean NOT NULL DEFAULT false;
 ELSE
  CREATE TABLE financial_install_probe.finance_column_probe (LIKE miclub.movement_refunds);
  ALTER TABLE financial_install_probe.finance_column_probe DROP COLUMN applications_tracked;
  ALTER TABLE financial_install_probe.finance_column_probe ADD COLUMN applications_tracked boolean NOT NULL DEFAULT false;
  IF EXISTS(SELECT 1 FROM pg_attribute e JOIN pg_attribute a ON a.attrelid='miclub.movement_refunds'::regclass AND a.attname=e.attname
   WHERE e.attrelid='financial_install_probe.finance_column_probe'::regclass AND e.attnum>0
   AND (a.atttypid<>e.atttypid OR a.atttypmod<>e.atttypmod OR a.attnotnull<>e.attnotnull)) THEN
   RAISE EXCEPTION 'Columna incompatible: miclub.movement_refunds.applications_tracked. No se modificaron datos.';
  END IF;
  DROP TABLE financial_install_probe.finance_column_probe;
 END IF;
END $recover$;
ALTER TABLE miclub.refund_obligation_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.refund_obligation_applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON miclub.refund_obligation_applications;
CREATE POLICY tenant_scope ON miclub.refund_obligation_applications
 USING(club_id=nullif(current_setting('app.club_id',true),'')::uuid)
 WITH CHECK(club_id=nullif(current_setting('app.club_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON miclub.refund_obligation_applications TO miclub_runtime;
DROP TRIGGER IF EXISTS capture_refund_application_history ON miclub.refund_obligation_applications;
CREATE TRIGGER capture_refund_application_history BEFORE UPDATE ON miclub.refund_obligation_applications
 FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
CREATE OR REPLACE FUNCTION miclub.finance_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; reason text;
BEGIN
 PERFORM miclub.finance_lock(NEW.club_id);
 actor := nullif(current_setting('app.finance_actor',true),'')::uuid;
 reason := coalesce(nullif(current_setting('app.finance_reason',true),''),'Operación registrada por el sistema');
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN ('movements','activity_terms') THEN NEW.revision:=OLD.revision+1; END IF;
  IF TG_TABLE_NAME='movements' THEN
   IF OLD.reconciled_at IS NOT NULL AND
      (to_jsonb(NEW)-ARRAY['reconciled_at','revision','updated_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['reconciled_at','revision','updated_at']) THEN NEW.reconciled_at:=NULL; END IF;
  END IF;
  INSERT INTO miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason)
  VALUES(NEW.club_id,TG_TABLE_NAME,NEW.id,to_jsonb(OLD),to_jsonb(NEW),actor,reason);
 ELSE
  INSERT INTO miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason)
  VALUES(NEW.club_id,TG_TABLE_NAME,NEW.id,NULL,to_jsonb(NEW),actor,reason);
 END IF;
 RETURN NEW;
END $$;$migration$;
 IF NOT EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609090003_initial_obligation_applications.sql') THEN
  INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('202609090003_initial_obligation_applications.sql','b7e6f505f03e11c9cb1a7539c2585cb05feb81f400c9195e0c7c9da02ede458d');
 END IF;
 IF to_regclass('miclub.finance_history') IS NULL OR to_regclass('miclub.settlement_reviews') IS NULL THEN RAISE EXCEPTION 'Validación estructural fallida'; END IF;
END $install$;
DROP SCHEMA financial_install_probe;
SELECT activity_id,id AS term_id,effective_from,effective_to,mode,fixed_fee_frequency,
 responsible_person_id,partial_month_policy FROM miclub.activity_terms
WHERE responsible_person_id IS NULL OR (mode='FIXED' AND (partial_month_policy IS NULL OR fixed_fee_frequency<>'MONTHLY'));
COMMIT;
