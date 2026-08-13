# Corrección forense del importador Google Sheets — 2026-07-25

## Evidencia disponible y límite de reproducción

El checkout no contiene `.env` productivo, `DATABASE_URL`, credenciales de Google ni cookie de una sesión real. Por seguridad no se inventaron resultados, no se ejecutó un import real y no se ejecutó SQL correctivo. El backup con `pg_dump` y un nuevo dry-run externo quedan como pasos operativos bloqueados hasta ejecutar en el host que posee esas credenciales.

## Causa sistémica demostrada en código

El importador agrupaba 50 filas dentro de una transacción PostgreSQL y capturaba la excepción de cada fila sin recuperar la transacción. PostgreSQL deja la transacción abortada después del primer statement fallido; las filas posteriores reciben `25P02 current transaction is aborted`. Así un único error real podía transformarse en decenas de errores derivados por grupo y ocultar su código original.

La corrección crea un `SAVEPOINT` por fila, hace `ROLLBACK TO SAVEPOINT` ante el error y continúa únicamente después de restaurar la transacción. Un test simula expresamente el estado abortado y prueba que la tercera fila se procesa después de fallar la segunda.

Los 128 writes intentados eran conteos de statements operativos incrementados antes del rollback (persona, vínculos, catálogos, actividad, inscripción/movimiento, balances y snapshots), no 128 entidades persistidas. La UI ahora distingue `operationalWritesAttempted` de `metadataWrites`; el dry-run mantiene cero writes operativos persistidos.

## Diagnóstico del batch original

Ejecutar `docs/dbeaver/04_import_dry_run_diagnostic_readonly.sql`, reemplazando `PEGAR_BATCH_ID_AQUI` por el batch real. Las consultas entregan top agrupado, primeros 20 errores cronológicos, hoja, fila, entidad, tenant, duplicados e integridad cruzada. El primer error que no sea `TRANSACTION_ABORTED` es el error de datos/schema a corregir; no debe inferirse a partir de los 1944 derivados.

## Contrato y panel

`GET /api/import/batches/:id/errors` continúa tenant-scoped y agrega resumen agrupado, paginación y filtros `sheet`/`entity`. No devuelve `raw_payload`, SQL ni stack. Los errores legacy se proyectan como `error_code`, `sheet`, `row_number`, `entity_type`, `message`, `club_id` y metadata no sensible.

## Rango y mapping

Los rangos siguen siendo configuración del entorno y no se cambiaron sin inspeccionar la hoja real. La lectura ya resuelve encabezados por hoja y omite arrays completamente vacíos. En el nuevo resumen se separan `rowsFetched`, `rowsDetected`, `rowsSkippedEmpty`, `rowsValid` y `rowsInvalid`; con la API actual de Sheets, `rowsFetched` cuenta filas devueltas/importables porque las trailing blanks no son devueltas por `values.batchGet`.

## Procedimiento seguro pendiente en el host productivo

1. Cargar el entorno sin imprimir secretos y ejecutar `pg_dump --format=custom`.
2. Ejecutar el SQL read-only con el batch original y conservar su salida.
3. Desplegar esta revisión y ejecutar exclusivamente dry-run autenticado.
4. Comparar filas, movimientos, inscripciones, top de errores y sumas con una importación conocida.
5. No habilitar import real salvo que el backend confirme un dry-run del mismo club, menor a 30 minutos y con `errors = 0`.

No se generó backfill ni migración de constraints: el material disponible no demuestra que sean necesarios, y hacerlo sería SQL especulativo contrario a la política solicitada.
