-- DBeaver: ejecutar el script completo. El ROLLBACK inicial recupera la sesión
-- si un intento anterior dejó la conexión en estado 25P02.
ROLLBACK;
BEGIN;

ALTER TABLE miclub.crm_message_templates ADD COLUMN IF NOT EXISTS club_id uuid;
ALTER TABLE miclub.crm_message_templates ADD COLUMN IF NOT EXISTS legacy_sqlite_id text;
ALTER TABLE miclub.crm_message_history ADD COLUMN IF NOT EXISTS club_id uuid;
ALTER TABLE miclub.crm_message_history ADD COLUMN IF NOT EXISTS legacy_sqlite_id integer;
ALTER TABLE miclub.crm_message_history ADD COLUMN IF NOT EXISTS member_id text;
ALTER TABLE miclub.crm_message_history ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE miclub.crm_message_history ADD COLUMN IF NOT EXISTS template_name text;

-- Solo es seguro asignar datos CRM legacy automáticamente cuando hay un club.
DO $$
DECLARE only_club uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.crm_message_templates WHERE club_id IS NULL)
     OR EXISTS (SELECT 1 FROM miclub.crm_message_history WHERE club_id IS NULL) THEN
    IF (SELECT count(*) FROM miclub.clubs) <> 1 THEN
      RAISE EXCEPTION 'CRM legacy requiere mapeo explícito de club_id: existen % clubes', (SELECT count(*) FROM miclub.clubs);
    END IF;
    SELECT id INTO only_club FROM miclub.clubs LIMIT 1;
    UPDATE miclub.crm_message_templates SET club_id=only_club WHERE club_id IS NULL;
    UPDATE miclub.crm_message_history SET club_id=only_club WHERE club_id IS NULL;
  END IF;
END $$;

-- La versión original usaba UUID, mientras que las plantillas predeterminadas
-- usan identificadores de texto (friendly/direct/etc.). Primero se elimina la
-- FK dependiente, luego se convierte ambos extremos y finalmente se recrea como
-- FK compuesta por tenant.
ALTER TABLE miclub.crm_message_history
  DROP CONSTRAINT IF EXISTS crm_message_history_template_id_fkey;
ALTER TABLE miclub.crm_message_history
  DROP CONSTRAINT IF EXISTS crm_message_history_template_club_fkey;
ALTER TABLE miclub.crm_message_templates
  DROP CONSTRAINT IF EXISTS crm_message_templates_pkey;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='crm_message_templates'
      AND column_name='id' AND data_type <> 'text'
  ) THEN
    ALTER TABLE miclub.crm_message_templates ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE miclub.crm_message_templates ALTER COLUMN id TYPE text USING id::text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='crm_message_history'
      AND column_name='template_id' AND data_type <> 'text'
  ) THEN
    ALTER TABLE miclub.crm_message_history ALTER COLUMN template_id TYPE text USING template_id::text;
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS miclub.crm_message_history_legacy_id_seq;
ALTER SEQUENCE miclub.crm_message_history_legacy_id_seq OWNED BY miclub.crm_message_history.legacy_sqlite_id;
ALTER TABLE miclub.crm_message_history
  ALTER COLUMN legacy_sqlite_id SET DEFAULT nextval('miclub.crm_message_history_legacy_id_seq');
UPDATE miclub.crm_message_templates
   SET legacy_sqlite_id=id WHERE legacy_sqlite_id IS NULL;
UPDATE miclub.crm_message_history
   SET legacy_sqlite_id=nextval('miclub.crm_message_history_legacy_id_seq')
 WHERE legacy_sqlite_id IS NULL;
UPDATE miclub.crm_message_history
   SET member_id=coalesce(enrollment_id::text, person_id::text, id::text)
 WHERE member_id IS NULL OR btrim(member_id)='';
SELECT setval('miclub.crm_message_history_legacy_id_seq',
              greatest(coalesce((SELECT max(legacy_sqlite_id) FROM miclub.crm_message_history), 0), 1),
              EXISTS (SELECT 1 FROM miclub.crm_message_history));

ALTER TABLE miclub.crm_message_templates ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE miclub.crm_message_history ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE miclub.crm_message_history ALTER COLUMN legacy_sqlite_id SET NOT NULL;
ALTER TABLE miclub.crm_message_history ALTER COLUMN member_id SET NOT NULL;

-- Quita las uniques globales heredadas antes de crear identidades por club.
ALTER TABLE miclub.crm_message_templates DROP CONSTRAINT IF EXISTS crm_message_templates_legacy_sqlite_id_key;
ALTER TABLE miclub.crm_message_history DROP CONSTRAINT IF EXISTS crm_message_history_legacy_sqlite_id_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_message_templates_pkey' AND conrelid='miclub.crm_message_templates'::regclass) THEN
    ALTER TABLE miclub.crm_message_templates ADD CONSTRAINT crm_message_templates_pkey PRIMARY KEY (club_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_templates_club_legacy_unique' AND conrelid='miclub.crm_message_templates'::regclass) THEN
    ALTER TABLE miclub.crm_message_templates ADD CONSTRAINT crm_templates_club_legacy_unique UNIQUE (club_id, legacy_sqlite_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_history_club_legacy_unique' AND conrelid='miclub.crm_message_history'::regclass) THEN
    ALTER TABLE miclub.crm_message_history ADD CONSTRAINT crm_history_club_legacy_unique UNIQUE (club_id, legacy_sqlite_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_message_templates_club_fkey' AND conrelid='miclub.crm_message_templates'::regclass) THEN
    ALTER TABLE miclub.crm_message_templates ADD CONSTRAINT crm_message_templates_club_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_message_history_club_fkey' AND conrelid='miclub.crm_message_history'::regclass) THEN
    ALTER TABLE miclub.crm_message_history ADD CONSTRAINT crm_message_history_club_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_message_history_template_club_fkey' AND conrelid='miclub.crm_message_history'::regclass) THEN
    ALTER TABLE miclub.crm_message_history ADD CONSTRAINT crm_message_history_template_club_fkey
      FOREIGN KEY (club_id, template_id) REFERENCES miclub.crm_message_templates(club_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_history_club_created_idx ON miclub.crm_message_history (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_history_club_member_idx ON miclub.crm_message_history (club_id, member_id);

CREATE TABLE IF NOT EXISTS miclub.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES miclub.users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_active_idx ON miclub.app_sessions (id, expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS miclub.rate_limit_buckets (
  bucket_key text NOT NULL, window_start timestamptz NOT NULL, request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL, PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON miclub.rate_limit_buckets (expires_at);

DO $$
DECLARE table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.table_schema='miclub' AND c.column_name='club_id' AND t.table_type='BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON miclub.%I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON miclub.%I USING (club_id = nullif(current_setting(''app.club_id'', true), '''')::uuid) WITH CHECK (club_id = nullif(current_setting(''app.club_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

COMMIT;
