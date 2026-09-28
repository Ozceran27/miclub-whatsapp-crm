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
