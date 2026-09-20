-- EJECUCIÓN MANUAL EN DBEAVER — sectores obligatorios por club
-- Este script no debe ejecutarse mediante AUDIT_DATABASE_URL.
-- Requiere un rol de mantenimiento con escritura sobre miclub.clubs/sectors.
-- Si cualquier precondición o validación falla, PostgreSQL deja la transacción
-- abortada: ejecute ROLLBACK; resuelva el diagnóstico y vuelva a comenzar.

-- 1. Diagnóstico previo (solo lectura).
SELECT current_user AS usuario, current_setting('transaction_read_only') AS solo_lectura;
SELECT c.id AS club_id, c.name AS club,
       count(s.id) FILTER (WHERE s.archived_at IS NULL) AS sectores_activos_no_archivados,
       count(s.id) FILTER (WHERE lower(btrim(s.code)) IN ('administracion','tesoreria','areas-comunes')) AS coincidencias_canonicas
  FROM miclub.clubs c
  LEFT JOIN miclub.sectors s ON s.club_id=c.id
 GROUP BY c.id,c.name ORDER BY c.name;

WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
SELECT s.club_id,c.code AS identidad_canonica,
       count(*) AS cantidad,array_agg(s.id ORDER BY s.id) AS ids
  FROM canonical c JOIN miclub.sectors s
    ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
    OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
 GROUP BY s.club_id,c.code
HAVING count(*)>1;

SELECT id,club_id,code,name,archived_at
  FROM miclub.sectors
 WHERE (regexp_replace(translate(lower(btrim(code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g') IN ('administracion','tesoreria','areas-comunes')
    OR regexp_replace(translate(lower(btrim(name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g') IN ('administracion','tesoreria','areas-comunes'))
   AND archived_at IS NOT NULL
 ORDER BY club_id,code;

-- 2. Reparación transaccional. Revise que las dos consultas de conflicto
-- anteriores devuelvan cero filas antes de continuar.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('miclub.manual.required_system_sectors'));
LOCK TABLE miclub.clubs, miclub.sectors IN SHARE ROW EXCLUSIVE MODE;

DO $preconditions$
BEGIN
  IF current_setting('transaction_read_only')::boolean THEN
    RAISE EXCEPTION 'La conexión está en modo read-only';
  END IF;
  IF to_regclass('miclub.clubs') IS NULL OR to_regclass('miclub.sectors') IS NULL THEN
    RAISE EXCEPTION 'Faltan miclub.clubs o miclub.sectors';
  END IF;
  IF EXISTS (
    WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
    SELECT 1 FROM canonical c JOIN miclub.sectors s
      ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
      OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
     GROUP BY s.club_id,c.code HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Hay códigos canónicos duplicados por club';
  END IF;
  IF EXISTS (
    WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
    SELECT 1 FROM canonical c JOIN miclub.sectors s
      ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
      OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
     GROUP BY s.id HAVING count(DISTINCT c.code)>1
  ) THEN
    RAISE EXCEPTION 'Una fila coincide con más de una identidad canónica';
  END IF;
  IF EXISTS (
    WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
    SELECT 1 FROM miclub.sectors s JOIN canonical c
      ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
      OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
     WHERE s.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hay sectores canónicos archivados; resolver manualmente';
  END IF;
END
$preconditions$;

WITH canonical(code,name,icon_key) AS (VALUES
  ('administracion','Administración','administration'),
  ('tesoreria','Tesorería','treasury'),
  ('areas-comunes','Áreas Comunes','social-hall')
)
UPDATE miclub.sectors s
   SET code=c.code,name=c.name,icon=c.icon_key,icon_key=c.icon_key,status='active',
       is_system=true,uses_activities=false,template_id=null,updated_at=now()
  FROM canonical c
 WHERE (regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
    OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code)
   AND s.archived_at IS NULL;

WITH canonical(code,name,icon_key) AS (VALUES
  ('administracion','Administración','administration'),
  ('tesoreria','Tesorería','treasury'),
  ('areas-comunes','Áreas Comunes','social-hall')
)
INSERT INTO miclub.sectors(club_id,code,name,icon,icon_key,color,status,capacity_mode,configured_capacity,is_system,uses_activities,template_id)
SELECT club.id,c.code,c.name,c.icon_key,c.icon_key,'#2563EB','active','INCOME',null,true,false,null
  FROM miclub.clubs club CROSS JOIN canonical c
 WHERE NOT EXISTS (
   SELECT 1 FROM miclub.sectors s WHERE s.club_id=club.id AND s.code=c.code
 );

DO $postvalidation$
BEGIN
  IF EXISTS (
    SELECT c.id FROM miclub.clubs c
    LEFT JOIN miclub.sectors s ON s.club_id=c.id
      AND s.code IN ('administracion','tesoreria','areas-comunes')
      AND s.archived_at IS NULL AND s.status='active' AND s.is_system
    GROUP BY c.id HAVING count(s.id)<>3
  ) THEN
    RAISE EXCEPTION 'Postvalidación fallida: no todos los clubes tienen exactamente tres sectores';
  END IF;
  IF EXISTS (
    SELECT 1 FROM miclub.sectors s
    JOIN (VALUES
      ('administracion','Administración','administration'),
      ('tesoreria','Tesorería','treasury'),
      ('areas-comunes','Áreas Comunes','social-hall')
    ) c(code,name,icon_key) ON c.code=s.code
    WHERE s.archived_at IS NULL
      AND (s.name<>c.name OR s.icon<>c.icon_key OR s.icon_key<>c.icon_key
           OR s.status<>'active' OR NOT s.is_system)
  ) THEN
    RAISE EXCEPTION 'Postvalidación fallida: identidad canónica inconsistente';
  END IF;
END
$postvalidation$;

-- Revise el resultado antes de confirmar. Para cancelar, sustituya COMMIT por ROLLBACK.
SELECT c.id AS club_id,c.name AS club,s.code,s.name,s.icon_key,s.status,s.is_system
  FROM miclub.clubs c JOIN miclub.sectors s ON s.club_id=c.id
 WHERE s.code IN ('administracion','tesoreria','areas-comunes') AND s.archived_at IS NULL
 ORDER BY c.name,s.code;

COMMIT;

-- 3. Verificación posterior, segura para repetir.
SELECT c.id,c.name,count(s.id) AS sectores_canonicos_activos
  FROM miclub.clubs c LEFT JOIN miclub.sectors s ON s.club_id=c.id
   AND s.code IN ('administracion','tesoreria','areas-comunes')
   AND s.archived_at IS NULL AND s.status='active' AND s.is_system
 GROUP BY c.id,c.name ORDER BY c.name;

-- Rollback operativo posterior: no se automatiza porque podría borrar filas que
-- ya estén referenciadas. Restaure primero un backup o identifique únicamente
-- las filas insertadas por esta ejecución, verifique cero referencias y elimínelas
-- manualmente dentro de una nueva transacción. Las normalizaciones de filas
-- preexistentes deben revertirse desde el backup tomado antes de ejecutar.
