BEGIN;

SELECT pg_advisory_xact_lock(hashtext('miclub.migration.sector_templates_and_lifecycle'));

-- Keep the catalog naming consistent with every other runtime catalog.  Some
-- databases received the DBeaver draft, which called this column `active`.
CREATE TABLE IF NOT EXISTS miclub.sector_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  display_name text NOT NULL,
  icon_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL,
  CONSTRAINT sector_templates_code_uk UNIQUE (code),
  CONSTRAINT sector_templates_code_format_ck CHECK (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT sector_templates_display_order_ck CHECK (display_order > 0)
);

DO $column_name$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='sector_templates' AND column_name='active'
  ) AND NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='sector_templates' AND column_name='is_active'
  ) THEN
    ALTER TABLE miclub.sector_templates RENAME COLUMN active TO is_active;
  ELSIF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema='miclub' AND table_name='sector_templates' AND column_name='active'
  ) THEN
    UPDATE miclub.sector_templates SET is_active=active;
    ALTER TABLE miclub.sector_templates DROP COLUMN active;
  END IF;
END
$column_name$;

COMMENT ON TABLE miclub.sector_templates IS 'Catálogo global, sin club_id, de identidades disponibles para sectores.';

-- The list is the product catalog, not example data.  Unknown historical rows
-- remain addressable by existing sectors but cease to be provisionable.
UPDATE miclub.sector_templates SET is_active=false
WHERE code NOT IN (
  'futbol','futsal','basquet','voley','handball','hockey','tenis','padel','natacion','gimnasio',
  'fitness','artes-marciales','patin','gimnasia-artistica','atletismo','rugby','bochas','pelota-paleta',
  'salon','aula','biblioteca','cultura','cantina','quincho','pileta','camping','estacionamiento','eventos','alquileres','otros'
);

INSERT INTO miclub.sector_templates(code,display_name,icon_key,is_active,display_order) VALUES
 ('futbol','Fútbol','sports_soccer',true,10),('futsal','Futsal','sports_soccer',true,20),
 ('basquet','Básquet','sports_basketball',true,30),('voley','Vóley','sports_volleyball',true,40),
 ('handball','Handball','sports_handball',true,50),('hockey','Hockey','sports_hockey',true,60),
 ('tenis','Tenis','sports_tennis',true,70),('padel','Pádel','sports_tennis',true,80),
 ('natacion','Natación','pool',true,90),('gimnasio','Gimnasio','fitness_center',true,100),
 ('fitness','Fitness','exercise',true,110),('artes-marciales','Artes Marciales','sports_martial_arts',true,120),
 ('patin','Patín','roller_skating',true,130),('gimnasia-artistica','Gimnasia Artística','sports_gymnastics',true,140),
 ('atletismo','Atletismo','sprint',true,150),('rugby','Rugby','sports_rugby',true,160),
 ('bochas','Bochas','sports',true,170),('pelota-paleta','Pelota Paleta','sports_tennis',true,180),
 ('salon','Salón','meeting_room',true,190),('aula','Aula','school',true,200),
 ('biblioteca','Biblioteca','local_library',true,210),('cultura','Cultura','theater_comedy',true,220),
 ('cantina','Cantina','restaurant',true,230),('quincho','Quincho','outdoor_grill',true,240),
 ('pileta','Pileta recreativa','pool',true,250),('camping','Camping','camping',true,260),
 ('estacionamiento','Estacionamiento','local_parking',true,270),('eventos','Eventos','celebration',true,280),
 ('alquileres','Alquileres','storefront',true,290),('otros','Otros','category',true,300)
ON CONFLICT (code) DO UPDATE SET
 display_name=excluded.display_name, icon_key=excluded.icon_key,
 is_active=excluded.is_active, display_order=excluded.display_order;

-- These columns used to exist only in a manual administration script.
ALTER TABLE miclub.sectors
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS capacity_mode text,
  ADD COLUMN IF NOT EXISTS configured_capacity integer,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS template_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_template_fk') THEN
    ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_template_fk
      FOREIGN KEY(template_id) REFERENCES miclub.sector_templates(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_manager_person_tenant_fkey') THEN
    ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_manager_person_id_fkey;
    ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_manager_person_tenant_fkey
      FOREIGN KEY(manager_person_id,club_id) REFERENCES miclub.people(id,club_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_created_by_tenant_fkey') THEN
    ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_created_by_fkey;
    ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_created_by_tenant_fkey
      FOREIGN KEY(created_by,club_id) REFERENCES miclub.user_club_memberships(user_id,club_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_updated_by_tenant_fkey') THEN
    ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_updated_by_fkey;
    ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_updated_by_tenant_fkey
      FOREIGN KEY(updated_by,club_id) REFERENCES miclub.user_club_memberships(user_id,club_id) ON DELETE RESTRICT NOT VALID;
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS sectors_club_template_active_uk
 ON miclub.sectors(club_id,template_id) WHERE template_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS sectors_manager_person_club_fkey_idx
 ON miclub.sectors(manager_person_id,club_id) WHERE manager_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sectors_created_by_club_fkey_idx
 ON miclub.sectors(created_by,club_id) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS sectors_updated_by_club_fkey_idx
 ON miclub.sectors(updated_by,club_id) WHERE updated_by IS NOT NULL;

ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_status_allowed_check;
ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_status_allowed_check
 CHECK(status IS NULL OR status IN ('active','inactive','under_repair','archived')) NOT VALID;

DO $validation$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid='miclub.sectors'::regclass AND NOT convalidated ORDER BY conname
  LOOP
    EXECUTE format('ALTER TABLE miclub.sectors VALIDATE CONSTRAINT %I',constraint_name);
  END LOOP;
  IF (SELECT count(*) FROM miclub.sector_templates WHERE is_active) <> 30
     OR EXISTS (SELECT FROM miclub.sector_templates WHERE is_active AND nullif(btrim(icon_key),'') IS NULL) THEN
    RAISE EXCEPTION 'El catálogo debe contener exactamente 30 plantillas activas con icono';
  END IF;
END
$validation$;

-- Runtime can list the global catalog but may never mutate it.  This explicit
-- revoke intentionally overrides the broad compatibility grant/default grant.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON miclub.sector_templates FROM miclub_runtime;
GRANT SELECT ON miclub.sector_templates TO miclub_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON miclub.sector_templates TO miclub_admin;

DO $permissions$
BEGIN
  IF NOT has_table_privilege('miclub_runtime','miclub.sector_templates','SELECT')
     OR has_table_privilege('miclub_runtime','miclub.sector_templates','INSERT')
     OR has_table_privilege('miclub_runtime','miclub.sector_templates','UPDATE')
     OR has_table_privilege('miclub_runtime','miclub.sector_templates','DELETE') THEN
    RAISE EXCEPTION 'miclub_runtime debe tener acceso de solo lectura a sector_templates';
  END IF;
END
$permissions$;

COMMIT;
