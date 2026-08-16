# Fronteras de runtime, migración y compatibilidad

## Aplicación productiva

`apps/api/src/index.ts` monta el runtime ordinario sobre PostgreSQL. Su arranque valida configuración y abre el servidor, pero no crea ni siembra datos. En particular, no carga SQLite, `googleapis` ni el grafo de importadores. `CRM_SOURCE=postgres`, `DATA_SOURCE=postgres`, `IMPORT_ENDPOINTS_ENABLED=false` y `DEBUG_ENDPOINTS_ENABLED=false` son la configuración normal.

Las rutas raíz `/members`, `/debtors`, `/summary`, `/sync-status`, `/club-finance-summary` y `/sector-operational-summary` son nombres legacy todavía consumidos por `homeApi`. CRM también conserva `/templates`, `/history`, `/contacted-recent` y `/prepare-messages`. Aunque su URL sea temporal, todas estas rutas usan PostgreSQL en producción. El test `legacyFrontendContract.test.ts` fija el contrato detectado estáticamente en los clientes actuales.

## Herramientas operativas y Backfill

Google Sheets fue retirado definitivamente después de certificar el E2E XLSX: no hay módulos, scripts, variables ni dependencias ejecutables. `npm run check:no-google-sheets-runtime` impide que vuelvan a entrar al grafo productivo. Los antecedentes se conservan sólo como documentación en `docs/history/`.

SQLite se conserva exclusivamente como origen de auditoría/migración CRM. `crmService` importa el adaptador dinámicamente cuando una operación selecciona explícitamente `CRM_SOURCE=sqlite`; producción rechaza esa configuración. No existe seed automático: restaurar plantillas predeterminadas es una acción autenticada, explícita e idempotente por club mediante `POST /templates/reset-defaults`.

Por estos usos operativos, `sqlite3` y `googleapis` continúan como dependencias del workspace API, aunque quedan fuera del grafo principal. Sólo deben eliminarse cuando también se retiren las herramientas de migración/backfill.

## Diagnóstico temporal

Los endpoints de comparación que consultan Sheets se habilitan con `DEBUG_ENDPOINTS_ENABLED=true` y cargan su implementación dinámicamente. `/api/dashboard-reconciliation` responde 404 con el flag apagado. Ningún diagnóstico debe habilitarse permanentemente en producción.
