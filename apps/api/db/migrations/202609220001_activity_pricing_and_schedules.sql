-- Prices paid by members are independent of the club/responsible settlement terms.
-- Historical activities intentionally remain without a price term until reviewed.
BEGIN;

DO $$ BEGIN
  IF to_regclass('miclub.activities') IS NULL OR to_regclass('miclub.activity_schedules') IS NULL
     OR to_regclass('miclub.enrollments') IS NULL OR to_regclass('miclub.clubs') IS NULL THEN
    RAISE EXCEPTION 'ACTIVITY_PRICING_PREREQUISITES_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='btree_gist') THEN
    RAISE EXCEPTION 'ACTIVITY_PRICING_REQUIRES_BTREE_GIST';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS miclub.activity_price_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  activity_id uuid NOT NULL,
  enrollment_price numeric NOT NULL CHECK (enrollment_price >= 0 AND enrollment_price < 1000000000000 AND enrollment_price = trunc(enrollment_price)),
  fee_price numeric NOT NULL CHECK (fee_price >= 0 AND fee_price < 1000000000000 AND fee_price = trunc(fee_price)),
  fee_frequency text NOT NULL CHECK (fee_frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  currency_code text NOT NULL REFERENCES miclub.currencies(code),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES miclub.users(id),
  updated_by uuid REFERENCES miclub.users(id),
  CONSTRAINT activity_price_terms_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT activity_price_terms_activity_tenant_fkey FOREIGN KEY (activity_id,club_id)
    REFERENCES miclub.activities(id,club_id) ON DELETE RESTRICT,
  CONSTRAINT activity_price_terms_id_club_unique UNIQUE(id,club_id),
  CONSTRAINT activity_price_terms_no_overlap EXCLUDE USING gist
    (club_id WITH =, activity_id WITH =, daterange(effective_from,coalesce(effective_to + 1,'infinity'::date),'[)') WITH &&)
);
CREATE INDEX IF NOT EXISTS activity_price_terms_lookup_idx ON miclub.activity_price_terms(club_id,activity_id,effective_from DESC);
COMMENT ON TABLE miclub.activity_price_terms IS 'Versioned member-facing registration and recurring prices; never the activity settlement amount.';

ALTER TABLE miclub.activity_schedules ADD COLUMN IF NOT EXISTS club_id uuid;
UPDATE miclub.activity_schedules s SET club_id=a.club_id
FROM miclub.activities a WHERE a.id=s.activity_id AND s.club_id IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM miclub.activity_schedules WHERE club_id IS NULL) THEN
    RAISE EXCEPTION 'ACTIVITY_SCHEDULE_TENANT_BACKFILL_REQUIRED';
  END IF;
END $$;
ALTER TABLE miclub.activity_schedules ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE miclub.activity_schedules DROP CONSTRAINT IF EXISTS activity_schedules_activity_id_fkey;
ALTER TABLE miclub.activity_schedules DROP CONSTRAINT IF EXISTS activity_schedules_activity_tenant_fkey;
ALTER TABLE miclub.activity_schedules ADD CONSTRAINT activity_schedules_activity_tenant_fkey
  FOREIGN KEY(activity_id,club_id) REFERENCES miclub.activities(id,club_id) ON DELETE RESTRICT;
ALTER TABLE miclub.activity_schedules DROP CONSTRAINT IF EXISTS activity_schedules_time_order_check;
ALTER TABLE miclub.activity_schedules ADD CONSTRAINT activity_schedules_time_order_check CHECK(start_time < end_time);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='activity_schedules_no_overlap' AND conrelid='miclub.activity_schedules'::regclass) THEN
    ALTER TABLE miclub.activity_schedules ADD CONSTRAINT activity_schedules_no_overlap EXCLUDE USING gist
      (club_id WITH =, activity_id WITH =, weekday WITH =,
       int4range(extract(epoch FROM start_time)::integer,extract(epoch FROM end_time)::integer,'[)') WITH &&);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS activity_schedules_tenant_lookup_idx ON miclub.activity_schedules(club_id,activity_id,weekday,start_time);

ALTER TABLE miclub.enrollments ADD COLUMN IF NOT EXISTS enrollment_price_snapshot numeric;
ALTER TABLE miclub.enrollments ADD COLUMN IF NOT EXISTS fee_price_snapshot numeric;
ALTER TABLE miclub.enrollments ADD COLUMN IF NOT EXISTS fee_frequency_snapshot text;
ALTER TABLE miclub.enrollments ADD COLUMN IF NOT EXISTS activity_price_term_id uuid;
ALTER TABLE miclub.enrollments DROP CONSTRAINT IF EXISTS enrollments_price_snapshots_check;
ALTER TABLE miclub.enrollments ADD CONSTRAINT enrollments_price_snapshots_check CHECK
  ((enrollment_price_snapshot IS NULL OR (enrollment_price_snapshot >= 0 AND enrollment_price_snapshot < 1000000000000 AND enrollment_price_snapshot = trunc(enrollment_price_snapshot))) AND
   (fee_price_snapshot IS NULL OR (fee_price_snapshot >= 0 AND fee_price_snapshot < 1000000000000 AND fee_price_snapshot = trunc(fee_price_snapshot))) AND
   (fee_frequency_snapshot IS NULL OR fee_frequency_snapshot IN ('DAILY','WEEKLY','MONTHLY','YEARLY')));
ALTER TABLE miclub.enrollments DROP CONSTRAINT IF EXISTS enrollments_price_term_tenant_fkey;
ALTER TABLE miclub.enrollments ADD CONSTRAINT enrollments_price_term_tenant_fkey
  FOREIGN KEY(activity_price_term_id,club_id) REFERENCES miclub.activity_price_terms(id,club_id) ON DELETE RESTRICT;

ALTER TABLE miclub.activity_price_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.activity_price_terms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON miclub.activity_price_terms;
CREATE POLICY tenant_isolation ON miclub.activity_price_terms TO miclub_runtime
  USING (club_id=nullif(current_setting('app.club_id',true),'')::uuid)
  WITH CHECK (club_id=nullif(current_setting('app.club_id',true),'')::uuid);
ALTER TABLE miclub.activity_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.activity_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON miclub.activity_schedules;
CREATE POLICY tenant_isolation ON miclub.activity_schedules TO miclub_runtime
  USING (club_id=nullif(current_setting('app.club_id',true),'')::uuid)
  WITH CHECK (club_id=nullif(current_setting('app.club_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON miclub.activity_price_terms TO miclub_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON miclub.activity_schedules TO miclub_runtime;

COMMIT;
