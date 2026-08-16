# Inventario canónico de runtime y legado

**Vigencia: 2026-08-16.** Este documento es la fuente canónica para decidir si
una pieza de compatibilidad se conserva o se elimina. La clasificación se obtiene
recorriendo imports estáticos y dinámicos, entradas de paquetes, montajes de
Express y consumidores de pruebas; una referencia documental no consume código.

## Grafo productivo vigente

```text
apps/api/src/index.ts
├─ /api/migration → importación XLSX autenticada → PostgreSQL
├─ /api → dashboardRoutes → PostgreSQL
├─ rutas URL compatibles → postgresDashboard/* → PostgreSQL
└─ rutas CRM → servicios/repositorios PostgreSQL
```

`legacyCompatRoutes` conserva URLs utilizadas por el frontend; su nombre no
describe una fuente de datos legacy. Google Sheets no es una fuente, fallback,
herramienta desplegable ni dependencia de la API.

## Retiro definitivo de Google Sheets

El E2E operativo XLSX que habilitaba esta decisión fue certificado antes del
retiro. El análisis del grafo confirmó que los adaptadores sólo eran alcanzables
desde `importGoogleSheetsToPostgres.ts`, una herramienta histórica controlada, y
desde pruebas de esas reglas antiguas. Se retiraron de `apps/api/src`:

- `importers/googleSheetsImporter.ts` y `importers/googleSheets/`;
- `scripts/importGoogleSheetsToPostgres.ts`;
- las fachadas y pruebas de Google Sheets bajo `legacy/googleSheets/`;
- los comandos `import:sheets` e `import:sheets:dry`;
- la dependencia `googleapis` y la configuración `GOOGLE_*` de `.env.example`.

La evidencia y los runbooks previos permanecen en `docs/history/`; son material
forense y no puntos de entrada ejecutables. No se debe restaurar el importador para
una nueva migración: el único camino soportado es XLSX.

`npm run check:no-google-sheets-runtime` protege la decisión verificando que las
rutas retiradas sigan ausentes, que ningún import de la API alcance Google Sheets
y que paquetes y scripts no vuelvan a exponerlo.

## Legado restante

SQLite permanece limitado a pruebas explícitas de compatibilidad. No está montado
en Express ni actúa como fuente o fallback productivo. Su retiro tiene una puerta
independiente y no forma parte de la retirada de Google Sheets.
