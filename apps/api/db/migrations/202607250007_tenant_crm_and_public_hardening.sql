BEGIN;

-- CRM records were historically global. A deterministic automatic backfill is
-- safe only when exactly one club exists; otherwise deployment must map legacy
-- data explicitly before applying this migration.
ALTER TABLE miclub.crm_message_templates ADD COLUMN IF NOT EXISTS club_id uuid;
ALTER TABLE miclub.crm_message_history ADD COLUMN IF NOT EXISTS club_id uuid;
DO $$
DECLARE only_club uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.crm_message_templates WHERE club_id IS NULL)
     OR EXISTS (SELECT 1 FROM miclub.crm_message_history WHERE club_id IS NULL) THEN
    IF (SELECT count(*) FROM miclub.clubs) <> 1 THEN
      RAISE EXCEPTION 'CRM legacy requiere un mapeo explícito de club_id: existen % clubes', (SELECT count(*) FROM miclub.clubs);
    END IF;
    SELECT id INTO only_club FROM miclub.clubs LIMIT 1;
    UPDATE miclub.crm_message_templates SET club_id = only_club WHERE club_id IS NULL;
    UPDATE miclub.crm_message_history SET club_id = only_club WHERE club_id IS NULL;
  END IF;
END $$;
ALTER TABLE miclub.crm_message_templates ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE miclub.crm_message_history ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE miclub.crm_message_templates
  ADD CONSTRAINT crm_message_templates_club_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;
ALTER TABLE miclub.crm_message_history
  ADD CONSTRAINT crm_message_history_club_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;
ALTER TABLE miclub.crm_message_templates DROP CONSTRAINT IF EXISTS crm_message_templates_pkey;
ALTER TABLE miclub.crm_message_templates DROP CONSTRAINT IF EXISTS crm_message_templates_legacy_sqlite_id_key;
ALTER TABLE miclub.crm_message_templates ADD PRIMARY KEY (club_id, id);
ALTER TABLE miclub.crm_message_templates ADD CONSTRAINT crm_templates_club_legacy_unique UNIQUE (club_id, legacy_sqlite_id);
ALTER TABLE miclub.crm_message_history DROP CONSTRAINT IF EXISTS crm_message_history_legacy_sqlite_id_key;
ALTER TABLE miclub.crm_message_history ADD CONSTRAINT crm_history_club_legacy_unique UNIQUE (club_id, legacy_sqlite_id);
CREATE INDEX IF NOT EXISTS crm_history_club_created_idx ON miclub.crm_message_history (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_history_club_member_idx ON miclub.crm_message_history (club_id, member_id);

-- Revocable server-side sessions. Cookies carry this opaque id, while current
-- membership and permissions are revalidated by the API.
CREATE TABLE IF NOT EXISTS miclub.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES miclub.users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_active_idx ON miclub.app_sessions (id, expires_at) WHERE revoked_at IS NULL;

-- Shared fixed-window rate-limit storage works across API replicas.
CREATE TABLE IF NOT EXISTS miclub.rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON miclub.rate_limit_buckets (expires_at);

-- RLS is defence in depth. The runtime must SET app.club_id for each
-- transaction and must not own these tables nor have BYPASSRLS.
DO $$
DECLARE table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name FROM information_schema.columns c
     JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.table_schema='miclub' AND c.column_name='club_id' AND t.table_type='BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON miclub.%I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON miclub.%I USING (club_id = nullif(current_setting(''app.club_id'', true), '''')::uuid) WITH CHECK (club_id = nullif(current_setting(''app.club_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

COMMIT;
