# Auditoría del dry-run de Migración — 2026-07-25

## Incidente 422 `381daabf-2626-469a-b7d6-7b58dccda273`

El artefacto de base disponible en el repositorio es anterior al incidente y el
checkout no incluye `DATABASE_URL`, cookie de sesión ni credenciales de Sheets.
Por eso **no se presenta como captura observada** una consulta a producción que
este entorno no pudo hacer. El contrato exacto del servidor desplegado en el
commit de partida permite reconstruir el body emitido para el `42P10` reportado:

```json
{
  "error": true,
  "message": "La base de datos no posee la restricción única requerida por el importador. Aplicá y validá la migración de constraints multi-tenant.",
  "status": 422,
  "code": "IMPORT_SCHEMA_CONFLICT_CONFIGURATION",
  "batchId": "381daabf-2626-469a-b7d6-7b58dccda273",
  "retryable": true,
  "requestId": "f278e055-9f62-4734-9798-87927aa4c994"
}
```

La request conocida fue `POST /api/import/google-sheets`, JSON
`{"dryRun":true,"batchSize":50}`. El frontend descartaba `code`, `batchId`,
`details` y el requestId del body; conservaba sólo `message` y sólo refrescaba
el historial en success. La base debía haber quedado `failed_configuration`
con `finished_at`, pero ese estado del UUID concreto sólo puede confirmarse
ejecutando `docs/dbeaver/05_import_schema_forensic_readonly.sql` sobre la base
real. No se inventan `requested_by`, conteos ni metadata que el schema histórico
no almacenaba.

La etapa exacta era la primera escritura simulada posterior a
`source_read_completed`: el importador abría la transacción de balances/metadata
y, posteriormente, procesaba upserts. La incompatibilidad demostrada en el dump
era la inferencia de índices UNIQUE parciales para `movements`/`enrollments`.
Ahora un preflight consulta `pg_index` antes de simular y exige exactamente
`(club_id, external_id) WHERE external_id IS NOT NULL`; el repository conserva
el mismo predicado en ambos `ON CONFLICT`.

El flujo nuevo emite las etapas `preflight_*`, `mapping_*`, `validation_*`,
`transaction_started`, `simulation_*`, `batch_finalized`, `response_sent` y,
ante fallo, `import_failed` con paso/código/mensaje seguro. Un precondition failure
genera un único `import_error`, finaliza el batch y responde 422 con `ok:false`,
`code`, `message`, `details`, `batchId` y `requestId`. El panel conserva ese body,
refresca batches también en error, selecciona el batch y ofrece abrir sus errores.

El lector ahora reporta por hoja `rowsFetched`, `rowsDetected`,
`rowsSkippedEmpty`, `membersDetected` y `movementsDetected`. Google Sheets omite
filas finales completamente vacías en `valueRanges`; las celdas con fórmula que
renderizan vacío sí son clasificadas por `isEmpty`. Sin acceso a la hoja viva no
es posible atribuir honestamente la diferencia 1944→1946; el nuevo desglose la
hace observable en el próximo dry-run.

No se añadió SQL correctivo nuevo: el dump ya contiene los índices parciales
compatibles y la migración `202607250010`/scripts manuales existentes son la
corrección autoritativa. El nuevo script 05 es estrictamente de solo lectura y
termina con PASS/FAIL. La base real, localhost autenticado y Cloudflare quedan
como validaciones operativas pendientes porque sus secretos no están disponibles
en este contenedor; no se ejecutó importación real.

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
