BEGIN;

SELECT pg_advisory_xact_lock(hashtext('miclub.migration.required_system_sectors'));
LOCK TABLE miclub.clubs, miclub.sectors IN SHARE ROW EXCLUSIVE MODE;

-- A normalized canonical code must identify at most one row in a tenant. Stop
-- instead of choosing a winner when historical data is ambiguous.
DO $preconditions$
BEGIN
  IF EXISTS (
    WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
    SELECT 1 FROM canonical c JOIN miclub.sectors s
      ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
      OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
     GROUP BY s.club_id,c.code HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Sectores canónicos duplicados por club; se requiere resolución manual';
  END IF;

  IF EXISTS (
    WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
    SELECT 1 FROM canonical c JOIN miclub.sectors s
      ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
      OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
     GROUP BY s.id HAVING count(DISTINCT c.code)>1
  ) THEN
    RAISE EXCEPTION 'Un sector coincide con más de una identidad canónica; se requiere resolución manual';
  END IF;

  IF EXISTS (
    WITH canonical(code) AS (VALUES ('administracion'),('tesoreria'),('areas-comunes'))
    SELECT 1 FROM miclub.sectors s JOIN canonical c
      ON regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
      OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g')=c.code
     WHERE s.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Existe un sector canónico archivado; se requiere resolución manual';
  END IF;
END
$preconditions$;

WITH canonical(code,name,icon_key) AS (VALUES
  ('administracion','Administración','administration'),
  ('tesoreria','Tesorería','treasury'),
  ('areas-comunes','Áreas Comunes','social-hall')
)
UPDATE miclub.sectors s
   SET code = c.code,
       name = c.name,
       icon = c.icon_key,
       icon_key = c.icon_key,
       status = 'active',
       is_system = true,
       uses_activities = false,
       template_id = null,
       updated_at = now()
  FROM canonical c
 WHERE (regexp_replace(translate(lower(btrim(s.code)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g') = c.code
    OR regexp_replace(translate(lower(btrim(s.name)),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','-','g') = c.code)
   AND s.archived_at IS NULL;

WITH canonical(code,name,icon_key) AS (VALUES
  ('administracion','Administración','administration'),
  ('tesoreria','Tesorería','treasury'),
  ('areas-comunes','Áreas Comunes','social-hall')
)
INSERT INTO miclub.sectors (
  club_id, code, name, icon, icon_key, color, status, capacity_mode,
  configured_capacity, is_system, uses_activities, template_id
)
SELECT club.id, c.code, c.name, c.icon_key, c.icon_key, '#2563EB', 'active',
       'INCOME', null, true, false, null
  FROM miclub.clubs club
 CROSS JOIN canonical c
 WHERE NOT EXISTS (
   SELECT 1 FROM miclub.sectors s
    WHERE s.club_id = club.id AND s.code = c.code
 );

DO $validation$
BEGIN
  IF EXISTS (
    SELECT club.id
      FROM miclub.clubs club
      LEFT JOIN miclub.sectors s
        ON s.club_id = club.id
       AND s.code IN ('administracion','tesoreria','areas-comunes')
       AND s.archived_at IS NULL
       AND s.status = 'active'
       AND s.is_system
     GROUP BY club.id
    HAVING count(s.id) <> 3
  ) THEN
    RAISE EXCEPTION 'Cada club debe tener exactamente tres sectores canónicos activos';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM miclub.sectors s
      JOIN (VALUES
        ('administracion','Administración','administration'),
        ('tesoreria','Tesorería','treasury'),
        ('areas-comunes','Áreas Comunes','social-hall')
      ) AS c(code,name,icon_key) ON c.code=s.code
     WHERE s.archived_at IS NULL
       AND (s.name<>c.name OR s.icon_key<>c.icon_key OR s.icon<>c.icon_key
            OR s.status<>'active' OR NOT s.is_system)
  ) THEN
    RAISE EXCEPTION 'La identidad visual o el estado de un sector canónico no quedó normalizado';
  END IF;
END
$validation$;

COMMIT;
