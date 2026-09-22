# Precios y horarios de actividades — ejecución manual

## Secuencia actual

Aplicar primero `202609220001_activity_pricing_and_schedules.sql` y después `202609220002_cancel_future_activity_prices.sql` en DBeaver, cada una según el procedimiento de ledger aprobado. La segunda tiene checksum SHA-256 `54f0feba7d5cc6e4280c1636a68906f5f43a891b1fa040ed83c1ea252b91f1d2`. No desplegar el backend que consulta `cancelled_at` hasta que ambas estén verificadas.

Precondiciones de la segunda migración, en transacción de sólo lectura:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user;
SHOW transaction_read_only;
SELECT to_regclass('miclub.activity_price_terms') AS price_terms;
SELECT conname FROM pg_constraint
WHERE conrelid='miclub.activity_price_terms'::regclass
  AND conname='activity_price_terms_no_overlap';
SELECT count(*) AS existing_prices FROM miclub.activity_price_terms;
COMMIT;
```

Después de ejecutarla, verificar en sólo lectura:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT attname, atttypid::regtype FROM pg_attribute
WHERE attrelid='miclub.activity_price_terms'::regclass AND attname='cancelled_at';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='miclub.activity_price_terms'::regclass
  AND conname='activity_price_terms_no_overlap';
SELECT count(*) AS prices, count(*) FILTER (WHERE cancelled_at IS NOT NULL) AS cancelled_prices
FROM miclub.activity_price_terms;
COMMIT;
```

La exclusión debe indicar `WHERE (cancelled_at IS NULL)`. Antes del `COMMIT`, `ROLLBACK` revierte la segunda migración. Después, conservar registros y restaurar backup junto con ledger si se requiere reversión; no eliminar `cancelled_at` mientras el runtime nuevo esté activo o existan cancelaciones. La auditoría de datos reales depende de disponer de una conexión de sólo lectura y de confirmar `current_user` y `transaction_read_only` antes de cualquier consulta.

No ejecutar `npm run db:migrate` contra la base real. Tomar backup verificable y ejecutar en DBeaver, con autocommit desactivado, la migración versionada [`202609220001_activity_pricing_and_schedules.sql`](../../../apps/api/db/migrations/202609220001_activity_pricing_and_schedules.sql). El archivo contiene una transacción completa y es reejecutable; el manifiesto exige SHA-256 `9e1a81f0630500f116fda1408dd131e0596136274066cc7cc96b8a410fbacc66`. Registrar en `public.miclub_schema_migrations` sólo mediante el procedimiento de despliegue aprobado, nunca falsificar una entrada.

## Precondiciones, sólo lectura

```sql
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user;
SHOW transaction_read_only;
SELECT to_regclass('miclub.activities') AS activities,
       to_regclass('miclub.activity_schedules') AS schedules,
       to_regclass('miclub.enrollments') AS enrollments;
SELECT extname FROM pg_extension WHERE extname='btree_gist';
SELECT activity_id, weekday, start_time, end_time, count(*)
FROM miclub.activity_schedules
GROUP BY 1,2,3,4 HAVING count(*)>1;
SELECT a.id, b.id FROM miclub.activity_schedules a
JOIN miclub.activity_schedules b ON a.activity_id=b.activity_id AND a.weekday=b.weekday AND a.id<b.id
 AND a.start_time<b.end_time AND b.start_time<a.end_time LIMIT 20;
COMMIT;
```

Resolver cualquier fila de las dos últimas consultas antes de migrar. Confirmar backup, nombre de base, usuario y rol; no continuar ante discrepancias.

## Posvalidación, sólo lectura

```sql
BEGIN TRANSACTION READ ONLY;
SELECT to_regclass('miclub.activity_price_terms') AS price_terms;
SELECT attname, attnotnull FROM pg_attribute
WHERE attrelid='miclub.activity_schedules'::regclass AND attname='club_id';
SELECT conname FROM pg_constraint WHERE conrelid IN
  ('miclub.activity_price_terms'::regclass,'miclub.activity_schedules'::regclass)
  AND contype IN ('x','f','c') ORDER BY conname;
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
WHERE oid IN ('miclub.activity_price_terms'::regclass,'miclub.activity_schedules'::regclass);
SELECT count(*) AS schedules_without_tenant FROM miclub.activity_schedules WHERE club_id IS NULL;
COMMIT;
```

## Rollback controlado

Antes del `COMMIT` de la migración, `ROLLBACK` revierte todo. Después del commit, restaurar el backup y el ledger como unidad es el rollback preferido. No eliminar la tabla ni las columnas si ya contienen términos o snapshots: sería pérdida de historia. Si se requiere reversión lógica del despliegue, detener escrituras, volver a la versión anterior de la aplicación, conservar estas estructuras inertes y planificar una migración compensatoria tras auditar dependencias y datos. No ejecutar `DROP ... CASCADE`.
