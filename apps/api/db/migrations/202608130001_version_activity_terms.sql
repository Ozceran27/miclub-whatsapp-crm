-- Contrato canónico de actividades y liquidaciones versionadas.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS miclub.activity_icon_catalog (
  icon_key text PRIMARY KEY,
  display_name text NOT NULL,
  sort_order integer NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order) VALUES
 ('football','Fútbol',1), ('basketball','Básquet',2), ('volleyball','Vóley',3), ('tennis','Tenis',4),
 ('swimming','Natación',5), ('running','Running',6), ('cycling','Ciclismo',7), ('gym','Gimnasio',8),
 ('weights','Musculación',9), ('yoga','Yoga',10), ('pilates','Pilates',11), ('dance','Danza',12),
 ('martial-arts','Artes marciales',13), ('boxing','Boxeo',14), ('hockey','Hockey',15), ('rugby','Rugby',16),
 ('skating','Patín',17), ('handball','Handball',18), ('gymnastics','Gimnasia',19), ('other','Otra actividad',20)
ON CONFLICT (icon_key) DO UPDATE SET display_name=excluded.display_name, sort_order=excluded.sort_order;

ALTER TABLE miclub.activities ADD COLUMN IF NOT EXISTS icon_key text;
CREATE UNIQUE INDEX IF NOT EXISTS activities_id_club_unique ON miclub.activities (id, club_id);
ALTER TABLE miclub.activities DROP CONSTRAINT IF EXISTS activities_icon_key_fkey;
ALTER TABLE miclub.activities ADD CONSTRAINT activities_icon_key_fkey
  FOREIGN KEY (icon_key) REFERENCES miclub.activity_icon_catalog(icon_key);

COMMENT ON COLUMN miclub.activities.instructor_id IS
  'Relación canónica y única con el responsable operativo de la actividad. manager_person_id es legado de lectura y no debe usarse en contratos nuevos.';
COMMENT ON COLUMN miclub.activities.manager_person_id IS
  'DEPRECATED: dato legado. El responsable canónico es instructor_id; debe derivarse de instructors.person_id durante la transición.';
COMMENT ON COLUMN miclub.activities.monthly_fee IS
  'Cuota de inscripción de la actividad (no es el fee mensual que el club liquida al responsable).';

CREATE OR REPLACE FUNCTION miclub.validate_activity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.club_commission_percent < 0 OR NEW.club_commission_percent > 100 THEN RAISE EXCEPTION 'club_commission_percent must be between 0 and 100' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('active','activa') AND NEW.instructor_id IS NULL THEN RAISE EXCEPTION 'active activity requires canonical instructor_id' USING ERRCODE='23514'; END IF;
  IF NEW.archived_at IS NOT NULL AND NEW.status NOT IN ('archived','cancelada') THEN RAISE EXCEPTION 'archived activity must have archived status' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS miclub.activity_terms_migration_diagnostic (
  activity_id uuid PRIMARY KEY REFERENCES miclub.activities(id),
  club_id uuid NOT NULL,
  legacy_settlement_mode text,
  legacy_fixed_amount numeric(14,2),
  legacy_club_percentage numeric(7,4),
  proposed_mode text,
  diagnosis text NOT NULL,
  diagnosed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO miclub.activity_terms_migration_diagnostic
  (activity_id, club_id, legacy_settlement_mode, legacy_fixed_amount, legacy_club_percentage, proposed_mode, diagnosis)
SELECT id, club_id, settlement_mode, settlement_fixed_amount, club_commission_percent,
  CASE WHEN lower(coalesce(settlement_mode,''))='fixed' THEN 'FIXED'
       WHEN lower(coalesce(settlement_mode,'')) IN ('percent','percentage','variable') THEN 'VARIABLE' END,
  CASE WHEN lower(coalesce(settlement_mode,'')) IN ('fixed','percent','percentage','variable') THEN 'READY'
       ELSE 'MANUAL_REVIEW' END
FROM miclub.activities
ON CONFLICT (activity_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS miclub.activity_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  activity_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('FIXED','VARIABLE')),
  monthly_fixed_fee numeric(14,2),
  club_share_percentage numeric(7,4),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES miclub.users(id),
  updated_by uuid REFERENCES miclub.users(id),
  CONSTRAINT activity_terms_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT activity_terms_values_check CHECK (
    (mode='VARIABLE' AND club_share_percentage BETWEEN 0 AND 100 AND monthly_fixed_fee IS NULL) OR
    (mode='FIXED' AND monthly_fixed_fee >= 0 AND club_share_percentage IS NULL)
  ),
  CONSTRAINT activity_terms_activity_tenant_fkey FOREIGN KEY (activity_id, club_id)
    REFERENCES miclub.activities(id, club_id)
);

ALTER TABLE miclub.activity_terms DROP CONSTRAINT IF EXISTS activity_terms_no_overlap;
ALTER TABLE miclub.activity_terms ADD CONSTRAINT activity_terms_no_overlap EXCLUDE USING gist
  (activity_id WITH =, daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') WITH &&);

-- Sólo los casos clasificados automáticamente se migran; MANUAL_REVIEW queda en el diagnóstico.
INSERT INTO miclub.activity_terms
  (club_id, activity_id, mode, monthly_fixed_fee, club_share_percentage, effective_from)
SELECT d.club_id, d.activity_id, d.proposed_mode,
  CASE WHEN d.proposed_mode='FIXED' THEN d.legacy_fixed_amount END,
  CASE WHEN d.proposed_mode='VARIABLE' THEN d.legacy_club_percentage END,
  CURRENT_DATE
FROM miclub.activity_terms_migration_diagnostic d
WHERE d.diagnosis='READY'
  AND ((d.proposed_mode='FIXED' AND d.legacy_fixed_amount >= 0)
    OR (d.proposed_mode='VARIABLE' AND d.legacy_club_percentage BETWEEN 0 AND 100))
  AND NOT EXISTS (SELECT 1 FROM miclub.activity_terms t WHERE t.activity_id=d.activity_id);

CREATE OR REPLACE FUNCTION miclub.guard_activity_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.movements WHERE club_id=OLD.club_id AND activity_id=OLD.id)
    OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE club_id=OLD.club_id AND activity_id=OLD.id)
    OR EXISTS (SELECT 1 FROM miclub.activity_terms WHERE club_id=OLD.club_id AND activity_id=OLD.id) THEN
    RAISE EXCEPTION 'activity with movements, enrollments or historical terms must be archived' USING ERRCODE='23503';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS activities_guard_delete ON miclub.activities;
CREATE TRIGGER activities_guard_delete BEFORE DELETE ON miclub.activities
FOR EACH ROW EXECUTE FUNCTION miclub.guard_activity_delete();

CREATE OR REPLACE FUNCTION miclub.validate_activity_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM miclub.sectors WHERE id=NEW.sector_id AND club_id=NEW.club_id) THEN RAISE EXCEPTION 'cross-tenant sector' USING ERRCODE='23514'; END IF;
  IF NEW.instructor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM miclub.instructors WHERE id=NEW.instructor_id AND club_id=NEW.club_id) THEN RAISE EXCEPTION 'cross-tenant instructor' USING ERRCODE='23514'; END IF;
  IF NEW.manager_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM miclub.people WHERE id=NEW.manager_person_id AND club_id=NEW.club_id) THEN RAISE EXCEPTION 'cross-tenant responsible' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS activities_validate_tenant ON miclub.activities;
CREATE TRIGGER activities_validate_tenant BEFORE INSERT OR UPDATE OF club_id, sector_id, instructor_id, manager_person_id ON miclub.activities
FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_tenant();
