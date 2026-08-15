# Inventario canónico de runtime y legado

Este documento es la fuente canónica para decidir si una pieza de compatibilidad se
conserva o se elimina. La clasificación se obtuvo recorriendo imports estáticos y
dinámicos, puntos de entrada de `package.json`/`knip.json`, montajes de Express y
consumidores de pruebas. Una referencia documental no cuenta como consumidor de código.

## Grafo de rutas montadas

```text
apps/api/src/index.ts [runtime]
├─ app.use("/api/migration", migrationUploadRoutes) [runtime, XLSX]
├─ app.use("/api", dashboardRoutes) [runtime]
├─ app.use(createLegacyCompatRoutes(...)) [runtime]
│  ├─ GET /health
│  ├─ GET /members ─┐
│  ├─ GET /debtors  │
│  ├─ GET /summary  ├─ postgresDashboardService → postgresDashboard/* → PostgreSQL
│  ├─ GET /club-finance-summary │
│  └─ GET /sector-operational-summary ─┘
│     GET /sync-status → PostgreSQL health/config
│     GET /club-finance-debug [flag DEBUG_ENDPOINTS_ENABLED]
│     GET /receivable-fees-effective-status-debug [flag DEBUG_ENDPOINTS_ENABLED]
└─ app.use(createCrmRoutes({ getMembersSource, isDebtorMember })) [runtime]
   └─ ambas funciones vuelven a legacyCompatRoutes → postgresDashboard/*
```

No existe un montaje Express desde `legacy/`, `importers/googleSheets`, SQLite o
mock data. El nombre `legacyCompatRoutes` describe compatibilidad de URL con el
frontend, no una fuente de datos legacy.

## Grafo de imports fuera del runtime

```text
package.json import:sheets* [tooling]
└─ scripts/importGoogleSheetsToPostgres.ts
   └─ importers/googleSheetsImporter.ts (fachada)
      ├─ importers/googleSheets/{implementation,entities,transactions,batches}.ts
      ├─ importers/googleSheets/{client,config,members,movements,finance,operational}.ts
      └─ legacy/googleSheets/googleSheets.ts (fachada de compatibilidad)
         └─ importers/googleSheets/*

*.test.ts [tests]
├─ legacy/googleSheets/dashboardReconciliationService.ts
│  ├─ legacy/googleSheets/googleSheets.ts
│  └─ postgresDashboardService.ts
└─ legacy/sqlite/sqlite.ts → sqlite3
```

`googleapis` es alcanzable desde el script `import:sheets` a través de
`implementation.ts` y `legacy.ts`. `sqlite3` es alcanzable por la prueba explícita
de compatibilidad `prepareMessages.test.ts`. Por ello ninguna de las dos
dependencias tiene cero uso y no se retira en este corte.

## Clasificación de símbolos y módulos

| Dominio | Símbolos o módulos | Clase | Consumidor / decisión |
| --- | --- | --- | --- |
| rutas compatibles | `createLegacyCompatRoutes`, `getMembersSource`, `isDebtorMember` | **runtime** | `index.ts`; los dos helpers también se inyectan en `createCrmRoutes` |
| manejo de error compatible | `isDatabaseUnavailableError` | **tests** + runtime interno | Exportado para `legacyCompatRoutes.test.ts`; usado internamente por `postgresFailure` |
| dashboard PostgreSQL | `getPostgresMembers`, `getPostgresDebtors`, `getPostgresSummary`, `getPostgresClubFinanceSummary`, `getPostgresSectorOperationalSummary`, `getPostgresReceivableEffectiveStatusDebug` | **runtime** | rutas compatibles, economía y auditoría PostgreSQL |
| fachadas `postgresDashboard/*` | `members.ts`, `finance.ts`, `sectorOperations.ts` y `postgresDashboardService.ts` | **runtime** | separan el servicio público de `implementation.ts` |
| importador Sheets | `importGoogleSheets`, `parseMissingEnrollmentStrategy`, `processMember`, `processMovement`, `processRowsWithSavepoints`, `resolveMovementRelation`, `getMovementImportAudit`, `isImportSchemaConflictConfiguration` | **tooling** y **tests** | script `import:sheets*` y pruebas unitarias; fuera del servidor |
| utilidades Sheets reexportadas | `getGoogleSheetsConfig`, resolutores de columnas, normalizadores, predicados y cálculos financieros/operativos de `importers/googleSheets/*` | **tooling** y **tests** | importador, fachada legacy y pruebas de reglas históricas |
| reconciliación Sheets | `buildDashboardReconciliation` | **tests** | fixture de reconciliación; no está montado |
| reconciliación Sheets | `getDashboardReconciliation` | **huérfano exportado** dentro de un módulo de tests | `knip` lo marca sin consumidor; se conserva por ahora junto al fixture, no habilita una ruta |
| SQLite | export default de `legacy/sqlite/sqlite.ts` | **tests** | import dinámico en `prepareMessages.test.ts`; no está en runtime |
| mock data | `members`, `templates` de `legacy/mockData/mockData.ts` | **huérfano** | cero imports según `knip` y `rg`; eliminado |
| comparación antigua | `compareLegacySummaryWithPostgresDashboard`, `compareLegacyMembersWithPostgresEnrollments`, `compareLegacyWithPostgres` | **huérfano** | cero imports y reemplazado por PostgreSQL/XLSX; eliminado |

Los reexports individuales que `knip` presenta como no usados no justifican borrar
el importador por archivo: la fachada sigue siendo tooling operativo y varios
símbolos sostienen pruebas. Una poda futura deberá hacerse símbolo por símbolo y
volver a ejecutar todos los controles.

## Puerta para retirar `googleapis` y `sqlite3`

La existencia del E2E XLSX real no puede inferirse de unit tests ni del código. La
evidencia operativa debe registrar lote aplicado, hash, reporte, tenant, backup y
responsable. Solo después de incorporarla se puede retirar el tooling reemplazado.
En el mismo cambio, los tres controles siguientes deben coincidir:

1. `knip` no informa consumidores ni dependencias necesarias.
2. La búsqueda de imports no encuentra `googleapis`, `sqlite3`, sus fachadas o
   imports dinámicos.
3. `package.json`, scripts operativos y CI no ofrecen comandos que entren a esos
   grafos.

Hasta entonces, Sheets queda clasificado como tooling y SQLite como tests, nunca
como runtime. No se acepta convertir la ausencia de evidencia E2E en evidencia de
que la migración terminó.
