# Baja manual y completa de un tenant

Este procedimiento es destructivo y **no es una migración**. Sólo un DBA puede ejecutarlo en DBeaver/psql, en una ventana aprobada; nunca se invoca desde la aplicación ni desde `runMigrations.ts`.

`miclub_gestion` es la **base de datos**. Dentro de ella, `miclub` es el schema de datos de negocio y `public` es otro schema reservado por este proyecto para metadata del runner. Por diseño, el ledger canónico es `public.miclub_schema_migrations`; no debe buscarse ni crearse bajo `miclub` sólo porque allí estén las tablas de negocio.

## Flujo obligatorio

1. Confirmar servidor/base/usuario y ejecutar `01_tenant_inventory_readonly.sql` en el destino real. Exportar todos los resultados: inventario tenant descubierto, consultas de conteo por club, FKs entrantes/salientes, objetos globales y comparación del ledger. Ejecutar además cada `dbeaver_count_query` devuelta.
2. No continuar **con la baja tenant** salvo que el resumen del manifest indique `gate_status=PASS`, `mismatches=0` y `ledger_rows=manifest_rows`. Si devuelve `BLOCKED_TENANT_DELETE_LEDGER_MISSING`, queda bloqueada únicamente esta operación destructiva: no crear el ledger manualmente ni ejecutar la baja; planificar su reconciliación antes de la futura ventana de eliminación. El listado esperado está generado desde `migrationManifest.ts`; cualquier diferencia requiere reconciliar despliegue, no editar el ledger.
3. Crear un backup lógico cifrado y verificable antes de abrir la transacción. Recomendado: `pg_dump --format=custom --dbname="$DATABASE_URL" --file="miclub-before-tenant-delete.dump"`; comprobar con `pg_restore --list miclub-before-tenant-delete.dump` y ensayar el restore en una base aislada. Registrar ticket/ruta/hash en `${backup_reference}`. Un conjunto de `INSERT` manuales no es rollback aceptable.
4. Completar `${club_id}`, `${expected_club_name}` y `${backup_reference}` en `02_delete_tenant_manual.sql`. Ejecutarlo primero sin modificar su `ROLLBACK`, revisar notices, conteos y locks. Las copias `pg_temp._backup_*` permiten inspeccionar el ensayo, pero desaparecen al cerrar la sesión y no reemplazan el backup.
5. Entregar diagnóstico, plan, backup/restore ensayado y salida del ensayo a revisión DBA. En la ventana aprobada, volver a ejecutar desde cero y cambiar **sólo** el último `ROLLBACK` por `COMMIT`.
6. Repetir el diagnóstico tras el commit y archivar evidencia de cero filas del club, catálogos globales íntegros y ledger intacto.

## Rollback operativo

Antes del commit, usar `ROLLBACK`. Después del commit, aislar escrituras y restaurar el dump/snapshot ensayado (preferentemente a una base nueva, validar y hacer cutover). Restaurar tablas compartidas directamente sobre producción puede sobrescribir cambios de otros clubes y requiere un plan DBA específico. No se ofrece rollback por `INSERT` manual porque no reconstruye de forma fiable IDs, FKs, secuencias, auditoría ni concurrencia.

`TRUNCATE` y cualquier variante `TRUNCATE ... CASCADE` están prohibidos. El script descubre tablas por catálogo, aplica `DELETE` en orden de FK con prioridades de dominio y aborta ante ciclos o diferencias de schema/manifest.

## Decisión cuando falta el ledger

`BLOCKED_TENANT_DELETE_LEDGER_MISSING` con `ledger_rows=0` significa que la comparación **no es posible**; no significa que sea seguro borrar ni que deban insertarse las migraciones esperadas. En esa condición `mismatches` se muestra como `NULL` y `comparison_status=NOT_COMPARABLE`. Revisar el result set de descubrimiento por si existe un ledger homónimo en otro schema, confirmar host/puerto/base con el DBA y reconstruir la historia de despliegue desde backups, logs o artefactos. No renombrar, crear ni poblar un ledger para superar el gate.

Sólo hay dos salidas aceptables: (a) corregir la conexión al destino real que sí posee el ledger canónico, o (b) reconciliar formalmente el despliegue del destino mediante un procedimiento DBA separado y volver a ejecutar el diagnóstico. `02_delete_tenant_manual.sql` permanece bloqueado hasta obtener `gate_status=PASS`; no debe “implementarse” en la aplicación ni ejecutarse mientras falte el ledger.

## Interpretación del destino local miclub_gestion

Si el diagnóstico muestra `database_name=miclub_gestion`, `server_address=127.0.0.1` (incluido un túnel al servidor productivo), las tablas de negocio bajo `miclub`, cero relaciones candidatas en el descubrimiento y `BLOCKED_TENANT_DELETE_LEDGER_MISSING`, la conexión puede ser correcta pero su despliegue no es demostrablemente compatible con el manifest. La presencia de tablas recientes no autoriza a reconstruir el ledger por inferencia: una tabla puede existir con DDL, constraints o backfills distintos. Antes de una baja hay que obtener evidencia del mecanismo que creó esa base (dump, scripts manuales, logs o backup) y hacer una reconciliación DBA separada.

Que `miclub.clubs` tenga una sola fila tampoco vuelve segura la baja. El inventario muestra tablas sin `club_id` que poseen FKs hacia tablas tenant (por ejemplo hijos de actividades); por eso no se debe improvisar un `DELETE FROM miclub.clubs` ni confiar en cascadas. El script manual continúa siendo una herramienta posterior al gate, no el siguiente paso inmediato.

## Fases cuando la baja será futura

1. **Ahora — reestructuración:** conservar estos scripts sin ejecutar la baja; corregir schema, constraints, código y migraciones mediante cambios versionados. No completar ni migrar datos del club sólo para poder borrarlo después.
2. **Antes de la baja — readiness:** congelar el manifest que corresponda al release desplegado, reconciliar o adoptar formalmente el ledger con evidencia DBA, volver a ejecutar el diagnóstico y archivar sus resultados. La reconciliación del ledger es importante para trazabilidad y para habilitar la baja, pero no obliga a interrumpir hoy la reestructuración ni a inventar historial.
3. **Ventana de baja:** crear y ensayar backup/restore, revisar el plan con DBA, ejecutar `02_delete_tenant_manual.sql` primero con `ROLLBACK` y sólo después considerar una ejecución aprobada con `COMMIT`.
4. **Después:** repetir el diagnóstico y conservar evidencia de cero filas tenant, usuarios compartidos preservados, catálogos globales íntegros y ledger intacto.

Hasta entrar en la fase 2, el resultado bloqueante debe registrarse como deuda operativa con responsable y criterio de salida; no debe “resolverse” insertando filas en el ledger ni relajando el gate.
