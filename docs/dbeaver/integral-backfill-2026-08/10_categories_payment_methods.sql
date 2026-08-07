/* Mapas explícitos obligatorios. No crea catálogos ni usa fuzzy matching. */
BEGIN;
CREATE TEMP TABLE category_alias(legacy_value text PRIMARY KEY,category_id uuid NOT NULL);
CREATE TEMP TABLE payment_alias(legacy_value text PRIMARY KEY,payment_method_id uuid NOT NULL);
-- Agregar INSERTs revisados contra la salida de 01. Sin filas, sólo diagnostica.
DO $$ BEGIN
 IF EXISTS(SELECT FROM category_alias x LEFT JOIN miclub.movement_categories c ON c.id=x.category_id WHERE c.id IS NULL)
 OR EXISTS(SELECT FROM payment_alias x LEFT JOIN miclub.payment_methods p ON p.id=x.payment_method_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'ID canónico inexistente en mapa'; END IF;
 IF to_regprocedure('miclub.movement_has_payment_allocation(uuid)') IS NULL THEN RAISE EXCEPTION 'BLOCKER: ejecute primero 04_sectors_backfill.sql completo'; END IF;
 IF EXISTS(SELECT FROM miclub.movements m WHERE (m.reconciled_at IS NOT NULL OR miclub.movement_has_payment_allocation(m.id)) AND
   ((m.category_id IS NULL AND EXISTS(SELECT FROM category_alias x WHERE lower(btrim(coalesce(m.source_payload->>'category',m.concept)))=lower(btrim(x.legacy_value)))) OR
    (m.payment_method_id IS NULL AND EXISTS(SELECT FROM payment_alias x WHERE lower(btrim(m.source_payload->>'payment_method'))=lower(btrim(x.legacy_value)))))) THEN
   RAISE EXCEPTION 'BLOCKER: el mapa intenta mutar movimientos financieros protegidos'; END IF;
 UPDATE miclub.movements m SET category_id=x.category_id FROM category_alias x
 WHERE m.category_id IS NULL AND lower(btrim(coalesce(m.source_payload->>'category',m.concept)))=lower(btrim(x.legacy_value));
 UPDATE miclub.movements m SET payment_method_id=x.payment_method_id FROM payment_alias x
 WHERE m.payment_method_id IS NULL AND lower(btrim(m.source_payload->>'payment_method'))=lower(btrim(x.legacy_value));
END $$;
SELECT 'category' domain,coalesce(source_payload->>'category',concept) unresolved,count(*) FROM miclub.movements WHERE category_id IS NULL GROUP BY 2
UNION ALL SELECT 'payment_method',source_payload->>'payment_method',count(*) FROM miclub.movements WHERE payment_method_id IS NULL GROUP BY 2;
COMMIT;
