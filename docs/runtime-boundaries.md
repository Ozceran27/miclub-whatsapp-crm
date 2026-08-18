# Fronteras de runtime, migración y compatibilidad

## Aplicación productiva

`apps/api/src/index.ts` monta el runtime ordinario sobre PostgreSQL. Su arranque valida configuración y abre el servidor, pero no crea ni siembra datos. En particular, no carga SQLite, `googleapis`, `bootstrapDirector.ts` ni importadores de Google Sheets. `CRM_SOURCE=postgres`, `DATA_SOURCE=postgres`, `IMPORT_ENDPOINTS_ENABLED=false`, `DEBUG_ENDPOINTS_ENABLED=false` y `BOOTSTRAP_DIRECTOR_ENABLED=false` son la configuración normal.

Las rutas raíz `/members`, `/debtors`, `/summary`, `/sync-status`, `/club-finance-summary` y `/sector-operational-summary` son nombres legacy todavía consumidos por `homeApi`. CRM también conserva `/templates`, `/history`, `/contacted-recent` y `/prepare-messages`. Aunque su URL sea temporal, todas estas rutas usan PostgreSQL en producción. El test `legacyFrontendContract.test.ts` fija el contrato detectado estáticamente en los clientes actuales.

## Herramientas operativas y Backfill

Google Sheets fue retirado definitivamente después de certificar el E2E XLSX: no hay módulos, scripts, variables ni dependencias ejecutables. En particular, **`googleapis` ya no es una dependencia** del workspace API. `npm run check:no-google-sheets-runtime` impide que vuelvan a entrar al grafo productivo. Los antecedentes se conservan sólo como documentación en `docs/history/` y no son procedimientos para una instalación nueva.

### Importación XLSX (vigente e independiente)

La carga de archivos `.xlsx` continúa soportada exclusivamente mediante `POST /api/migration`. Es un flujo local de archivo: inspecciona el contenedor XLSX, valida el lote y persiste en PostgreSQL. **No llama a Google Sheets API, no requiere credenciales `GOOGLE_*` y no usa `googleapis`.** Su operación vigente está documentada en [`import-xlsx.md`](import-xlsx.md).

SQLite se conserva exclusivamente como origen de auditoría/migración CRM. `crmService` importa el adaptador dinámicamente cuando una operación selecciona explícitamente `CRM_SOURCE=sqlite`; producción rechaza esa configuración. No existe seed automático: restaurar plantillas predeterminadas es una acción autenticada, explícita e idempotente por club mediante `POST /templates/reset-defaults`.

Por este uso operativo, `sqlite3` continúa como dependencia del workspace API, aunque queda fuera del grafo principal. Esto no aplica a `googleapis`, que ya fue eliminado.

## Reparación excepcional del director

`apps/api/src/scripts/bootstrapDirector.ts` se conserva sólo como reparación explícita e idempotente de la identidad legacy del director. Ningún comando `start`, módulo de startup ni migración lo invoca. Debe ejecutarse manualmente con `npm run bootstrap:director`, durante una ventana autorizada, proporcionando temporalmente `BOOTSTRAP_DIRECTOR_ENABLED=true` y una contraseña no versionada. Al terminar se eliminan esas variables y se restablece `BOOTSTRAP_DIRECTOR_ENABLED=false`; el arranque productivo rechaza el valor `true`.
