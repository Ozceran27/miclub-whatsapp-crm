# Architecture

## Vista general

miClub Gestión es un monorepo npm.

```text
miclub-whatsapp-crm/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   └── shared/
├── docs/
├── scripts/
└── package.json
```

## Stack observado

### API

- Node.js
- Express
- TypeScript
- PostgreSQL (`pg`)
- `tsx` para desarrollo/tests/scripts

### Web

- React 18
- Vite
- TypeScript
- Recharts

### Shared

- TypeScript
- contratos y tipos compartidos

## Runtime productivo

```text
Browser
  ↓
React/Vite
  ↓
Express API
  ↓
Auth + Membership + Tenant Context
  ↓
Services / Repositories
  ↓
PostgreSQL
```

En producción:

- autenticación obligatoria;
- `DATA_SOURCE=postgres`;
- `CRM_SOURCE=postgres`;
- `PUBLIC_APP_URL` HTTPS;
- ausencia de fallback silencioso a fuentes legacy.

## Tenant resolution

La regla vigente es:

```text
authenticated user
→ active membership
→ club
```

Las rutas tenant-scoped deben rechazar un `clubId` enviado por cliente como fuente de autoridad.

## Capas backend

El repo actual separa, con variaciones por dominio:

```text
Route
→ validation / permission
→ Service
→ Repository / PostgreSQL
```

El objetivo arquitectónico es impedir que:

- routes acumulen lógica de dominio compleja;
- frontend calcule reglas financieras centrales;
- repositories decidan reglas HTTP;
- existan dos servicios autoritativos para el mismo cálculo.

## Superficies principales observadas

- Auth
- DB health
- Modules/navigation
- Catalogs
- Sectors
- Activities
- Tasks
- Requests
- People
- Finance
- Movements
- Enrollments
- Economy
- Administration
- Onboarding
- Commercial plans
- Dashboard
- Migration XLSX
- CRM
- Legacy compatibility temporal

## Legacy compatibility

El inventario de rutas documenta algunos endpoints `legacy-compat` que siguen sirviendo contratos de frontend pero cuyos datos ya provienen de PostgreSQL.

Estos adaptadores no deben convertirse nuevamente en una segunda arquitectura.

Consultar:

- `docs/api-route-inventory.md`
- `docs/legacy-compat-audit.md`

## Fuentes de verdad

| Dominio | Fuente |
|---|---|
| Identidad | PostgreSQL |
| Clubes | PostgreSQL |
| Memberships/RBAC | PostgreSQL + contratos shared |
| Sectores | PostgreSQL |
| Actividades | PostgreSQL |
| Términos económicos | PostgreSQL |
| Movimientos | PostgreSQL |
| Inscripciones | PostgreSQL |
| Categorías | catálogo global + asociación tenant según modelo |
| CRM | PostgreSQL |
| Importación | XLSX → PostgreSQL |
| Economía | datos PostgreSQL + lógica backend |
| Migration order | `migrationManifest` |

## Migration architecture

El manifiesto de migraciones es la secuencia ejecutable canónica.

Reglas principales:

- no ordenar migrations por nombre fuera del manifest;
- no renombrar/modificar una migration aplicada sin transición explícita;
- timestamps nuevos globalmente únicos;
- nuevas migrations al final;
- `dependsOn`, `provides` y `requires` expresan dependencias;
- drift entre ledger, manifest y schema bloquea readiness.

Consultar `docs/migration-manifest-policy.md`.

## Runtime legacy

Google Sheets fue retirado del runtime según la documentación actual.

SQLite permanece como artefacto de compatibilidad/testing y no debe utilizarse como fallback de producción.

## Nota para agentes

Este documento resume arquitectura. Para decisiones detalladas, inspeccionar código y documentación especializada antes de modificar.
