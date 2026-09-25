-- miClub Gestión · categorías bidireccionales · ejecución MANUAL en DBeaver.
-- Ejecutar el archivo completo en una sola conexión con permisos de escritura.
-- Si un intento previo dejó la transacción abortada, ejecutar ROLLBACK antes.
-- No cambia IDs, catalog_id, clasificación ni movement.category_id.
-- La migración 202609220002 trata precios/horarios y NO es una precondición
-- estructural de este cambio. Este script no altera el ledger de migraciones:
-- cualquier desfase de ese ledger debe resolverse por el proceso de migración.

-- Auditoría previa. En la base auditada el 25/09/2026 hubo 35 categorías
-- activas con dirección fija, columna nullable y cero movimientos visibles.
-- Los conteos de esta consulta deben revisarse para el destino de DBeaver.
SELECT current_user AS usuario;
SHOW transaction_read_only;
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user;
SELECT to_regclass('miclub.movement_categories') AS categorias,
       to_regclass('miclub.category_catalog') AS catalogo,
       to_regclass('public.miclub_schema_migrations') AS ledger;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='miclub' AND table_name='movement_categories'
  AND column_name IN ('id','club_id','catalog_id','direction','is_active')
ORDER BY column_name;
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid='miclub.movement_categories'::regclass
ORDER BY conname;
SELECT name, checksum, applied_at
FROM public.miclub_schema_migrations
WHERE name IN ('202609220002_cancel_future_activity_prices.sql',
               '202609250001_bidirectional_movement_categories.sql')
ORDER BY name;
SELECT club_id, count(*) FILTER (WHERE is_active) AS activas,
       count(*) FILTER (WHERE is_active AND direction IS NOT NULL) AS direccion_fija
FROM miclub.movement_categories GROUP BY club_id ORDER BY club_id;

BEGIN;
DO $$ BEGIN
  IF current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'Se requiere una conexión de escritura para aplicar el cambio';
  END IF;
  IF to_regclass('miclub.movement_categories') IS NULL
     OR to_regclass('miclub.category_catalog') IS NULL
     OR to_regclass('public.miclub_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Falta el esquema canónico de categorías o el ledger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles
                 WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Se requiere un rol DBA con bypass de RLS para revisar y actualizar todos los clubes';
  END IF;
  IF EXISTS (SELECT 1 FROM miclub.movement_categories mc
             LEFT JOIN miclub.category_catalog cc ON cc.id=mc.catalog_id
             WHERE mc.is_active AND (mc.catalog_id IS NULL OR cc.id IS NULL)) THEN
    RAISE EXCEPTION 'Hay categorías activas sin referencia al catálogo canónico';
  END IF;
  IF EXISTS (SELECT 1 FROM public.miclub_schema_migrations
             WHERE name='202609250001_bidirectional_movement_categories.sql'
               AND checksum<>'b16fe616acdb795ab6535e3e41c4c73041a28b69049903ac6ac908ad1555a44c') THEN
    RAISE EXCEPTION 'El ledger contiene un checksum incompatible para la migración de categorías';
  END IF;
END $$;

-- Respaldo temporal de esta sesión, disponible para la reversión indicada abajo.
CREATE TEMP TABLE category_direction_before_20260925 ON COMMIT PRESERVE ROWS AS
SELECT id, club_id, catalog_id, direction, is_active
FROM miclub.movement_categories;

ALTER TABLE miclub.movement_categories ALTER COLUMN direction DROP NOT NULL;
UPDATE miclub.movement_categories SET direction=NULL
WHERE is_active AND direction IS NOT NULL;

-- Todas las poscondiciones deben pasar antes del COMMIT. Un error deja la
-- transacción sin aplicar; ejecutar ROLLBACK en DBeaver si eso ocurre.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM miclub.movement_categories
             WHERE is_active AND direction IS NOT NULL) THEN
    RAISE EXCEPTION 'Persisten categorías activas con dirección fija';
  END IF;
  IF EXISTS (
    SELECT id,club_id,catalog_id,is_active
      FROM pg_temp.category_direction_before_20260925
    EXCEPT
    SELECT id,club_id,catalog_id,is_active
      FROM miclub.movement_categories
  ) OR EXISTS (
    SELECT id,club_id,catalog_id,is_active
      FROM miclub.movement_categories
    EXCEPT
    SELECT id,club_id,catalog_id,is_active
      FROM pg_temp.category_direction_before_20260925
  ) THEN
    RAISE EXCEPTION 'Cambió la identidad, catálogo, club o estado de una categoría';
  END IF;
  IF EXISTS (SELECT 1 FROM miclub.movements m
             LEFT JOIN miclub.movement_categories c
               ON c.id=m.category_id AND c.club_id=m.club_id
             WHERE m.category_id IS NOT NULL AND c.id IS NULL) THEN
    RAISE EXCEPTION 'Hay movimientos con referencias de categoría rotas';
  END IF;
END $$;
COMMIT;

-- Validación posterior: ambos valores deben ser cero.
SELECT count(*) AS activas_con_direccion_fija
FROM miclub.movement_categories WHERE is_active AND direction IS NOT NULL;
SELECT count(*) AS referencias_de_movimiento_rotas
FROM miclub.movements m LEFT JOIN miclub.movement_categories c
  ON c.id=m.category_id AND c.club_id=m.club_id
WHERE m.category_id IS NOT NULL AND c.id IS NULL;

-- Reversión compensatoria, sólo en la MISMA conexión mientras exista la tabla
-- temporal. Revisar primero los movimientos creados después del COMMIT; un
-- retorno a direcciones fijas podría contradecir operaciones nuevas.
-- BEGIN;
-- UPDATE miclub.movement_categories actual SET direction=previo.direction
-- FROM pg_temp.category_direction_before_20260925 previo
-- WHERE actual.id=previo.id AND actual.club_id=previo.club_id;
-- COMMIT;
