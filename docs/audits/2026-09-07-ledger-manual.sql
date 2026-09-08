-- Consulta manual en DBeaver con un rol que ya tenga SELECT sobre el ledger.
-- No ejecutar con una conexión distinta a la base local auditada.
-- No cambia permisos, esquema ni datos. No sustituye las verificaciones del auditor.
BEGIN READ ONLY;
SELECT current_database(), current_user;
SHOW transaction_read_only;
SELECT to_regclass('public.miclub_schema_migrations') AS ledger;
SELECT name, checksum, applied_at
FROM public.miclub_schema_migrations
ORDER BY applied_at, name;
ROLLBACK;
-- Si hay error, ejecutar ROLLBACK. Exportar sólo el resultado del ledger.
-- No insertar filas ni ejecutar migraciones para reconciliarlo.
