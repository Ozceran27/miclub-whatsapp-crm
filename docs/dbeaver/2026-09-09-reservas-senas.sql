-- Ejecutar completo manualmente en DBeaver con propietario del schema.
-- Verificar base seleccionada y contar con backup. No modifica movimientos.
-- Ante cualquier error: ROLLBACK. No ejecutar sentencias sueltas.
-- Antes de COMMIT puede revertirse con ROLLBACK. Después de usar las categorías,
-- conservar referencias históricas y corregir hacia adelante, no borrar filas.
SELECT current_database(), current_user;
BEGIN;
SELECT pg_advisory_xact_lock(817320260908);
DO $ledger$ BEGIN
 IF to_regclass('public.miclub_schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'Falta ledger: reconciliar manualmente, no inventar historia';
 END IF;
 IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='202609090001_reservations_and_deposits_categories.sql' AND checksum<>'d04f7a3cd5fccdf50f21c4a08411bb09e06f796c8f093e41e9baaf4a212f588b') THEN
  RAISE EXCEPTION 'Checksum incompatible';
 END IF;
END $ledger$;
-- Additive product catalog update. Real DB: use the DBeaver wrapper.
-- No historical movements are reclassified. Roll back the transaction on error.
DO $precheck$
BEGIN
 IF to_regclass('miclub.category_catalog') IS NULL
 OR to_regclass('miclub.category_import_aliases') IS NULL THEN
  RAISE EXCEPTION 'Missing canonical category catalog';
 END IF;
 IF EXISTS (SELECT 1 FROM miclub.category_catalog WHERE code IN ('RESERVAS','SENAS')
   AND (classification <> 'OPERATIONAL' OR display_name <> CASE code WHEN 'RESERVAS' THEN 'Reservas' ELSE 'Señas' END)) THEN
  RAISE EXCEPTION 'Existing category conflicts with the approved catalog';
 END IF;
 IF EXISTS (SELECT 1 FROM miclub.movement_categories mc
   LEFT JOIN miclub.category_catalog cc ON cc.id=mc.catalog_id
   WHERE upper(trim(mc.name)) IN ('RESERVAS','SEÑAS')
   AND (cc.code IS NULL OR cc.code <> CASE upper(trim(mc.name)) WHEN 'RESERVAS' THEN 'RESERVAS' ELSE 'SENAS' END)) THEN
  RAISE EXCEPTION 'Tenant category with same name needs manual reconciliation';
 END IF;
END $precheck$;

INSERT INTO miclub.category_catalog(code,display_name,classification,display_order)
VALUES ('RESERVAS','Reservas','OPERATIONAL',340),('SENAS','Señas','OPERATIONAL',350)
ON CONFLICT(code) DO NOTHING;

INSERT INTO miclub.category_import_aliases(normalized_alias,catalog_id)
SELECT cc.code,cc.id FROM miclub.category_catalog cc WHERE cc.code IN ('RESERVAS','SENAS')
ON CONFLICT(normalized_alias) DO NOTHING;

INSERT INTO miclub.movement_categories(club_id,name,direction,is_active,catalog_id)
SELECT c.id,cc.display_name,'INGRESOS'::miclub.movement_type,true,cc.id
FROM miclub.clubs c CROSS JOIN miclub.category_catalog cc
WHERE cc.code IN ('RESERVAS','SENAS')
AND NOT EXISTS(SELECT 1 FROM miclub.movement_categories mc WHERE mc.club_id=c.id AND mc.catalog_id=cc.id)
ON CONFLICT (club_id,upper(trim(name))) DO NOTHING;

DO $postcheck$
BEGIN
 IF (SELECT count(*) FROM miclub.category_catalog WHERE code IN ('RESERVAS','SENAS') AND classification='OPERATIONAL') <> 2
 OR EXISTS(SELECT 1 FROM miclub.category_catalog cc
   LEFT JOIN miclub.category_import_aliases a ON a.normalized_alias=cc.code AND a.catalog_id=cc.id
   WHERE cc.code IN ('RESERVAS','SENAS') AND a.catalog_id IS NULL)
 OR EXISTS(SELECT 1 FROM miclub.clubs c CROSS JOIN miclub.category_catalog cc
   WHERE cc.code IN ('RESERVAS','SENAS') AND NOT EXISTS(
    SELECT 1 FROM miclub.movement_categories mc WHERE mc.club_id=c.id AND mc.catalog_id=cc.id AND mc.direction='INGRESOS')) THEN
  RAISE EXCEPTION 'Category installation incomplete or conflicting';
 END IF;
END $postcheck$;

INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('202609090001_reservations_and_deposits_categories.sql','d04f7a3cd5fccdf50f21c4a08411bb09e06f796c8f093e41e9baaf4a212f588b') ON CONFLICT(name) DO NOTHING;
COMMIT;
SELECT code,display_name,classification FROM miclub.category_catalog WHERE code IN ('RESERVAS','SENAS');
SELECT name,checksum FROM public.miclub_schema_migrations WHERE name='202609090001_reservations_and_deposits_categories.sql';
