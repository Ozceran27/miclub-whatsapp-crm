-- Ejecutar el archivo completo manualmente en DBeaver con un rol DDL autorizado.
-- Si una ejecución anterior quedó abierta sin COMMIT, cerrar esa transacción
-- explícitamente en DBeaver (COMMIT si fue íntegra, ROLLBACK si falló) antes de usar este archivo.
-- Requiere el esquema base y el rol miclub_runtime. No modifica tablas operativas.
-- El ledger de migraciones lo administra el runner; este SQL instala la estructura manualmente.
-- Para revertir antes del COMMIT: ROLLBACK;. Luego de COMMIT, conservar datos e implementar una migración reversora aprobada.
BEGIN;
DO $$ BEGIN
 IF current_setting('transaction_read_only') <> 'off' THEN RAISE EXCEPTION 'Se requiere conexión de escritura'; END IF;
 IF to_regclass('miclub.clubs') IS NULL THEN RAISE EXCEPTION 'Esquema base no instalado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='miclub_runtime') THEN RAISE EXCEPTION 'Falta miclub_runtime'; END IF;
 IF EXISTS (SELECT 1 FROM (VALUES ('crm_xlsx_batches'),('crm_xlsx_contacts'),('crm_xlsx_templates'),('crm_xlsx_messages')) AS x(name) WHERE to_regclass('miclub.'||x.name) IS NOT NULL) THEN RAISE EXCEPTION 'Una tabla CRM XLSX ya existe; auditar antes de instalar'; END IF;
END $$;
-- Isolated CRM spreadsheet snapshots. No FK to operational people or enrollments.
CREATE TABLE IF NOT EXISTS miclub.crm_xlsx_batches (
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_sha256 text NOT NULL,
  template_version text NOT NULL CHECK (template_version = 'v1'),
  status text NOT NULL CHECK (status IN ('dry_run','active','replaced')),
  row_count integer NOT NULL CHECK (row_count >= 0),
  uploaded_by uuid NOT NULL,
  dry_run_id uuid,
  base_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  PRIMARY KEY (club_id,id),
  FOREIGN KEY (club_id,dry_run_id) REFERENCES miclub.crm_xlsx_batches(club_id,id),
  FOREIGN KEY (club_id,base_batch_id) REFERENCES miclub.crm_xlsx_batches(club_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_xlsx_one_active_batch ON miclub.crm_xlsx_batches(club_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS crm_xlsx_batches_created ON miclub.crm_xlsx_batches(club_id,created_at DESC);

CREATE TABLE IF NOT EXISTS miclub.crm_xlsx_contacts (
  club_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_row integer NOT NULL CHECK (source_row >= 2),
  document text NOT NULL,
  contact_key text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('al_dia','nuevo_inscripto','adeudando','abandonado')),
  activity text,
  enrollment_date date,
  due_date date,
  PRIMARY KEY (club_id,id),
  UNIQUE (club_id,batch_id,contact_key),
  FOREIGN KEY (club_id,batch_id) REFERENCES miclub.crm_xlsx_batches(club_id,id)
);
CREATE INDEX IF NOT EXISTS crm_xlsx_contacts_page ON miclub.crm_xlsx_contacts(club_id,batch_id,status,last_name,first_name);

CREATE TABLE IF NOT EXISTS miclub.crm_xlsx_templates (
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id,id)
);

CREATE TABLE IF NOT EXISTS miclub.crm_xlsx_messages (
  club_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  contact_key text NOT NULL,
  phone text NOT NULL,
  enrollment_date date,
  due_date date,
  name text NOT NULL,
  activity text,
  message text NOT NULL,
  wa_link text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared','opened','sent_manual','skipped')),
  template_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  sent_at timestamptz,
  PRIMARY KEY (club_id,id),
  FOREIGN KEY (club_id,contact_id) REFERENCES miclub.crm_xlsx_contacts(club_id,id)
);
CREATE INDEX IF NOT EXISTS crm_xlsx_messages_recent ON miclub.crm_xlsx_messages(club_id,created_at DESC);
CREATE INDEX IF NOT EXISTS crm_xlsx_messages_pending ON miclub.crm_xlsx_messages(club_id,status,created_at DESC) WHERE status IN ('prepared','opened');

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['crm_xlsx_batches','crm_xlsx_contacts','crm_xlsx_templates','crm_xlsx_messages'] LOOP
    EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE miclub.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS crm_xlsx_tenant ON miclub.%I',t);
    EXECUTE format('CREATE POLICY crm_xlsx_tenant ON miclub.%I USING (club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid) WITH CHECK (club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid)',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON miclub.%I TO miclub_runtime',t);
  END LOOP;
END $$;

-- Post-validación dentro de la misma transacción.
DO $$ BEGIN
 IF (SELECT count(*) FROM (VALUES ('crm_xlsx_batches'),('crm_xlsx_contacts'),('crm_xlsx_templates'),('crm_xlsx_messages')) x(name) WHERE to_regclass('miclub.'||x.name) IS NOT NULL) <> 4 THEN RAISE EXCEPTION 'Instalación incompleta'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='miclub' AND c.relname IN ('crm_xlsx_batches','crm_xlsx_contacts','crm_xlsx_templates','crm_xlsx_messages') AND c.relrowsecurity AND c.relforcerowsecurity) <> 4 THEN RAISE EXCEPTION 'RLS incompleto'; END IF;
END $$;
-- Post-validación antes de confirmar. Cualquier error impide el COMMIT.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='miclub' AND tablename LIKE 'crm_xlsx_%' ORDER BY tablename;
COMMIT;
-- Si falla una precondición o una sentencia, ejecutar ROLLBACK en esta conexión.
