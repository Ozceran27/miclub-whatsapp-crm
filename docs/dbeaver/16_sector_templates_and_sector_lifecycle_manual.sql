/* DBeaver/manual | 16 | Catálogo global y ciclo de vida de sectores

   ESTADO: SUSTITUIDO POR LA MIGRACIÓN VERSIONADA
   - Para una instancia administrada por el runner NO ejecutar este archivo.
   - Ejecutar `npm run db:migrate`; la migración canónica es
     apps/api/db/migrations/202608210004_sector_templates_and_lifecycle.sql.
   - Este archivo se conserva únicamente para diagnóstico/remediación legacy
     autorizada. No debe marcarse manualmente en el ledger de migraciones.

   OBJETIVO
   - Crear miclub.sector_templates sin club_id y cargar 30 plantillas.
   - Vincular miclub.sectors.template_id y admitir under_repair.
   - Reutilizar, nunca duplicar, Administración/Tesorería/Áreas Comunes existentes.

   SEGURIDAD OPERATIVA
   - Pensado para una base ya operativa: no borra ni renombra sectores existentes.
   - La identidad de sector se compara como lower(btrim(code)), igualando/superando
     la semántica del índice sectors_club_code_key (club_id, lower(code)).
   - Ante datos ambiguos o un sector sistémico archivado, aborta toda la transacción
     con MANUAL_REVIEW en vez de decidir automáticamente.
   - Si una ejecución anterior falló dentro de BEGIN, el ROLLBACK inicial recupera
     la sesión DBeaver. El error 25P01 de ese ROLLBACK cuando no hay transacción es inocuo.

   DECISIÓN DE PRODUCTO PENDIENTE
   Cantina y Cantina/Buffet se tratan como un único concepto (`cantina`). Sólo debe
   agregarse otro código si Producto confirma que son opciones distintas.
*/

ROLLBACK;

-- 0. Diagnóstico de solo lectura. Revisar el resultado antes de ejecutar el resto.
SELECT s.club_id, s.id, s.code, s.name, s.status, s.is_system, s.archived_at
FROM miclub.sectors s
WHERE lower(btrim(coalesce(s.code,''))) IN ('administracion','tesoreria','areas-comunes')
ORDER BY s.club_id, lower(btrim(s.code)), s.archived_at NULLS FIRST, s.id;

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SELECT pg_advisory_xact_lock(hashtext('miclub.manual.16_sector_templates'));

-- 1. Preflight: una identidad sistémica por club como máximo y ninguna archivada.
DO $preflight$
DECLARE conflict record;
BEGIN
  SELECT s.club_id, lower(btrim(s.code)) AS code, count(*) AS matches
    INTO conflict
  FROM miclub.sectors s
  WHERE lower(btrim(coalesce(s.code,''))) IN ('administracion','tesoreria','areas-comunes')
  GROUP BY s.club_id, lower(btrim(s.code))
  HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'MANUAL_REVIEW: club % tiene % filas para el código normalizado %; no se modificó nada',
      conflict.club_id, conflict.matches, conflict.code;
  END IF;

  SELECT s.club_id, s.id, s.code INTO conflict
  FROM miclub.sectors s
  WHERE lower(btrim(coalesce(s.code,''))) IN ('administracion','tesoreria','areas-comunes')
    AND s.archived_at IS NOT NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'MANUAL_REVIEW: el sector sistémico existente % (club %, code %) está archivado; decidir su reactivación antes de reintentar',
      conflict.id, conflict.club_id, conflict.code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM miclub.sectors
    WHERE status IS NOT NULL
      AND status NOT IN ('active','inactive','under_repair','archived')
  ) THEN
    RAISE EXCEPTION 'MANUAL_REVIEW: existen status de sector fuera de active/inactive/under_repair/archived; consultar el diagnóstico al final';
  END IF;
END $preflight$;

-- 2. Catálogo global (deliberadamente sin club_id).
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
COMMENT ON TABLE miclub.sector_templates IS 'Catálogo global, sin club_id, de identidades disponibles para sectores.';

-- Compatibilidad exclusiva para instalaciones legacy que recibieron una versión
-- anterior de este mismo manual. CREATE TABLE IF NOT EXISTS no modifica una tabla
-- existente, por lo que se debe normalizar la columna antes del INSERT.
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

-- 3. Evolución compatible de sectors. No se reemplaza una FK válida existente.
ALTER TABLE miclub.sectors ADD COLUMN IF NOT EXISTS template_id uuid NULL;
DO $fk$
DECLARE fk_name text;
BEGIN
  SELECT c.conname INTO fk_name
  FROM pg_constraint c
  WHERE c.conrelid='miclub.sectors'::regclass
    AND c.contype='f'
    AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute
      WHERE attrelid='miclub.sectors'::regclass AND attname='template_id')]::smallint[]
  LIMIT 1;

  IF fk_name IS NULL THEN
    ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_template_fk
      FOREIGN KEY(template_id) REFERENCES miclub.sector_templates(id) NOT VALID;
    fk_name := 'sectors_template_fk';
  END IF;
  EXECUTE format('ALTER TABLE miclub.sectors VALIDATE CONSTRAINT %I',fk_name);
END $fk$;

CREATE UNIQUE INDEX IF NOT EXISTS sectors_club_template_active_uk
 ON miclub.sectors(club_id,template_id)
 WHERE template_id IS NOT NULL AND archived_at IS NULL;

-- Se conocen estos dos nombres de iteraciones previas. No se eliminan checks
-- arbitrarios que sólo casualmente mencionen "status".
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_status_allowed_check;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_status_ck;
ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_status_allowed_check
 CHECK(status IS NULL OR status IN ('active','inactive','under_repair','archived')) NOT VALID;
ALTER TABLE miclub.sectors VALIDATE CONSTRAINT sectors_status_allowed_check;

-- Valida las restricciones NOT VALID preexistentes, conservando sus nombres.
DO $constraints$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='miclub.sectors'::regclass AND NOT convalidated
    ORDER BY conname
  LOOP
    EXECUTE format('ALTER TABLE miclub.sectors VALIDATE CONSTRAINT %I',constraint_name);
  END LOOP;
END $constraints$;

-- 4. Sectores de sistema: primero se reutiliza y protege cualquier fila existente.
CREATE TEMP TABLE required_system_sectors(code text PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
INSERT INTO required_system_sectors(code,name) VALUES
 ('administracion','Administración'),
 ('tesoreria','Tesorería'),
 ('areas-comunes','Áreas Comunes');

UPDATE miclub.sectors s
SET is_system=true, updated_at=now()
FROM required_system_sectors r
WHERE lower(btrim(s.code))=r.code
  AND s.is_system IS DISTINCT FROM true;

-- Importante: NOT EXISTS no filtra archived_at y normaliza igual que el índice
-- único. Así una fila `ADMINISTRACION` existente jamás provoca un INSERT duplicado.
INSERT INTO miclub.sectors(club_id,code,name,is_system,status,uses_activities)
SELECT c.id,r.code,r.name,true,'active',false
FROM miclub.clubs c
CROSS JOIN required_system_sectors r
WHERE NOT EXISTS (
  SELECT 1 FROM miclub.sectors s
  WHERE s.club_id=c.id AND lower(btrim(s.code))=r.code
);

-- 5. Gates antes del COMMIT: cualquier incumplimiento revierte todo.
DO $validation$
DECLARE problem record;
BEGIN
  IF (SELECT count(*) FROM miclub.sector_templates WHERE is_active) <> 30 THEN
    RAISE EXCEPTION 'VALIDATION: se esperaban 30 plantillas activas';
  END IF;

  SELECT c.id AS club_id, count(s.id) AS system_count INTO problem
  FROM miclub.clubs c
  LEFT JOIN miclub.sectors s ON s.club_id=c.id
    AND lower(btrim(s.code)) IN ('administracion','tesoreria','areas-comunes')
    AND s.is_system=true AND s.archived_at IS NULL
  GROUP BY c.id HAVING count(s.id)<>3 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'VALIDATION: club % tiene % de los 3 sectores sistémicos requeridos',
      problem.club_id, problem.system_count;
  END IF;
END $validation$;

COMMIT;

-- 6. Verificación post-commit (resultados esperados: 30 y 3 por club).
SELECT count(*) AS active_templates FROM miclub.sector_templates WHERE is_active;
SELECT c.id AS club_id, count(s.id) AS active_system_sectors
FROM miclub.clubs c
LEFT JOIN miclub.sectors s ON s.club_id=c.id AND s.is_system AND s.archived_at IS NULL
  AND lower(btrim(s.code)) IN ('administracion','tesoreria','areas-comunes')
GROUP BY c.id ORDER BY c.id;

-- Sólo devuelve filas si hay estados históricos que requieren corrección manual.
SELECT id,club_id,code,name,status FROM miclub.sectors
WHERE status IS NOT NULL AND status NOT IN ('active','inactive','under_repair','archived')
ORDER BY club_id,code;
