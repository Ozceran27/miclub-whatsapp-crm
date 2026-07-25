# Auditoría del dry-run de Migración — 2026-07-25

## Checkpoint y reproducción previa

- Checkpoint inmutable: `checkpoint/migration-audit-pre-fix-20260725` en `cea41620e205033fc235bda86ef2e86229891214`.
- Rama: `fix/migration-dry-run-20260725`.
- Inicio registrado: `2026-07-25T19:40:51+00:00`.
- Build inicial: PASS. Tests API iniciales: 114/114 PASS.
- El contenedor no recibió `.env`, credenciales de usuario, PostgreSQL ni navegador. Por ello no fue posible repetir la sesión autenticada externa ni capturar DevTools/Cloudflare desde este entorno. La comprobación estática y el dump muestran que el cliente sí enviaba `POST /api/import/google-sheets`, mientras el servidor esperaba sin límite la lectura `batchGet` de Google Sheets y no emitía logs de progreso.

## Causa raíz

Había dos defectos de backend que permitían una espera indefinida y una degradación acumulativa:

1. `spreadsheets.values.batchGet` no tenía timeout ni límite de reintentos. El endpoint síncrono esperaba esa promesa antes de responder, y el frontend no tenía `AbortSignal`.
2. El importador ejecutaba `BEGIN`, writes y `ROLLBACK` mediante `pool.query`. Un pool no garantiza afinidad de conexión, por lo que la simulación no constituía una transacción correcta y podía dejar sesiones `idle in transaction`/agotar el pool. Ahora todo el trabajo transaccional usa un cliente dedicado, con rollback defensivo y `release()` en `finally`.

El estado visual no era la causa: el hook ya tenía `finally`, pero ese bloque solo se alcanza cuando la promesa finaliza.

## Modelo y contrato

Se conserva el modelo **síncrono** porque los batches históricos del dump terminan en aproximadamente 6–10 segundos. Ambos modos responden HTTP 200 solo al finalizar (se eliminó el 202 engañoso del modo real). Google Sheets tiene timeout acotado (45 s por defecto), el cliente web corta a 120 s y el lock advisory impide concurrencia solo dentro del mismo club.

Éxito agrega al contrato compatible: `batchId`, `mode`, `status`, `rowsRead`, `errors`, `warnings`, `writesAttempted`, `writesPersisted`, `writesReverted`, `enrollmentsProcessed`, `movementsProcessed`, `durationMs` y `warningMessages`. Los nombres históricos permanecen durante la transición.

Error: `code`, `message`, `batchId` cuando existe, `requestId` y `retryable`. La importación real vuelve a validar en servidor un dry-run tenant-scoped, sin errores y de menos de 30 minutos.

## Operación

El script `docs/dbeaver/04_import_dry_run_diagnostic_readonly.sql` inspecciona batches, actividad, transacciones, locks, bloqueadores, errores e invariantes y termina en PASS/FAIL. Es estrictamente de solo lectura; no se generó ni ejecutó SQL correctivo porque no hubo evidencia de una carencia de schema.
