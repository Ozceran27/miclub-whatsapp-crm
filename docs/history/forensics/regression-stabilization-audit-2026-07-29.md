# Auditoría de regresión y estabilización — 2026-07-29

## Alcance, checkpoint y límites de evidencia

- Rama auditada: `work`; SHA inicial: `ed635feeea4440385e49223d79980e521ede10aa`.
- El árbol estaba limpio. `npm ci` terminó correctamente.
- No hay `.env` operativo en el checkout. Por ello no se ejecutaron escrituras, migraciones ni SQL; tampoco fue posible producir un dump nuevo, autenticar usuarios reales, comparar endpoints con cifras de la instancia, ni probar el túnel Cloudflare. El repositorio ya contiene el dump fechado `202607291139`, que no fue alterado ni usado como sustituto de un backup del entorno activo.
- Esta auditoría no declara verificada una infraestructura que no estaba disponible. El SQL manual de sólo lectura `dbeaver/07_integral_regression_audit_readonly.sql` permite cerrar esa evidencia contra la instancia aprobada.

## Baseline reproducible

| Control | Resultado inicial | Evidencia / causa |
|---|---|---|
| `npm ci` | PASS | lockfile instalable; 449 paquetes |
| `npm run typecheck` | PASS | API, web y shared |
| `npm run build` | FAIL | npm construía `web` antes de `shared`; Vite no encontraba `@miclub/shared/dist/index.js` |
| tests de workspaces | FAIL/bloqueo | los tests legacy de mensajes activaban SQLite implícitamente y seis casos fallaban; el runner permanecía abierto |
| lint | no alcanzado en baseline | la ejecución quedó interrumpida por el runner bloqueado; no existe script `lint` en los workspaces |
| start/health/readiness | BLOCKED | faltan `PGHOST`, `PGDATABASE`, `PGUSER` (o `DATABASE_URL`) y configuración de sesión |
| dump PostgreSQL | BLOCKED | no hay credenciales/conectividad DB en el checkout; no se inventó ni ejecutó un dump |

## Auditoría de cambios recientes

| Cambio | Archivos principales | Riesgo | Consumidores | Estado |
|---|---|---|---|---|
| separación dashboard/migración | `postgresDashboard/*`, `migrationService.ts`, routes import/dashboard | contratos o imports antiguos | Home, Economía, Migración | typecheck y tests existentes cubren exports; sin regresión demostrada |
| contratos operativos compartidos | `packages/shared/src/contracts/*`, `packages/shared/src/index.ts` | web esperando array/formato previo | API client, hooks CRM/Home/Economy/Migration | typecheck PASS; respuestas paginadas explícitas conservadas |
| repositorios financieros | `economy/*`, `economyRepository.ts`, `movementPredicates.ts` | tenant/estado/signo | Inicio y Economía | tests de tenant y estados PASS |
| paginación/filtros | `listQuery.ts`, finance/CRM/import routes | límites, totals o query sin parámetros | listados web | tests de parsing PASS; agregaciones viven en endpoints separados |
| archivado/retención | migración `202607280002`, repos CRM/finance | pérdida de historia | CRM y Economía | no hay DELETE físico expuesto por finance; requiere validación SQL final |
| migración atómica | `migrationRepository.ts`, `migrationService.ts` | batch cruzado o parcial | panel Migración | tests de selección/tenant/transacción PASS |
| orden de build | `package.json` | artefacto shared inexistente al compilar web limpio | Vite | **corregido**: shared → API → web |
| fuente CRM | `crmService.ts` | fallback silencioso a SQLite si faltaba/malformaba `CRM_SOURCE` | todas las rutas CRM | **corregido**: PostgreSQL por defecto; SQLite sólo explícito |

## Mapa real y fuentes

- **Root/shared:** scripts npm; contratos de auth, HTTP, miembros, economía y migración en `packages/shared`.
- **API:** composición HTTP en `src/index.ts`; auth/tenant en middleware; rutas por dominio; services; repositories PostgreSQL; importador Google Sheets aislado bajo `importers`/`routes/importRoutes`.
- **Web:** router/sesión y cliente HTTP central; módulos Home, Economy, CRM, DataMigration y sectoriales; adapters API por dominio.

| Módulo | Superficie | Implementación/fuente | Tenant |
|---|---|---|---|
| INICIO | `/summary`, `/club-finance-summary`, `/sector-operational-summary` | `postgresDashboardService` / PostgreSQL | `req.auth.clubId` |
| ECONOMÍA | `/api/economy/*` | `economyService` + `economyRepository` / PostgreSQL | obligatorio |
| CRM | `/members`, `/debtors`, `/templates`, `/history`, `/prepare-messages` | members PostgreSQL + `crmRepository`; SQLite sólo migración explícita | obligatorio |
| MIGRACIÓN | `/api/import/*` | Google Sheets → importador transaccional → PostgreSQL | sesión + permiso |
| FITNESS/SALÓN/AULA/LOCAL 1/CANTINA | `/api/modules/*` y rutas compat PostgreSQL | dashboard/repos PostgreSQL | obligatorio |

Los usos de `googleapis`, `sheet` y fallbacks de columnas están dentro del importador. `mockData` conserva plantillas CRM predeterminadas y fixtures; no es fuente de paneles. SQLite sigue como artefacto de migración/auditoría CRM y test explícito, no como selección ordinaria.

## Tenant, contratos y cálculos

- El middleware rechaza `clubId` controlado por el cliente y los repositories auditados reciben `clubId`. Los tests de dos clubes cubren agregados, inscripciones, rankings, pendientes y movimientos recientes.
- La regla ordinaria autoritativa es `COMPLETADO`; `PENDIENTE` sólo alimenta saldo pendiente. El catálogo completo, fórmula, signo, período, endpoint y test está en `economy-calculation-catalog.md`.
- No se observó una diferencia de cifras demostrable sin la instancia. No se modificó ninguna fórmula, monto, fecha, UUID ni dato.
- Los DTO paginados de CRM/migración y los listados financieros conservan un único formato por endpoint. TypeScript valida consumidores web/API.

## Resultado funcional por módulo

| Área | Evidencia ejecutable local | Evidencia pendiente de infraestructura |
|---|---|---|
| INICIO | build/typecheck + tests de dashboard PostgreSQL, tenant y cero/fixture | smoke HTTP autenticado y comparación SQL |
| ECONOMÍA | tests de dominio, estados, timezone, repository/tenant y contratos | tarjetas/gráficos contra datos reales |
| CRM | tests de preparación repetida y default PostgreSQL; contratos web compilan | historial/contactos autenticados contra PostgreSQL |
| MIGRACIÓN | tests de dry-run, preflight ON CONFLICT, batches, errores y atomicidad | source health y dry/import contra Sheets autorizado |
| Auth | tests de login, cookie firmada, revocación/logout, bloqueo y tenant | navegador/F5/multitab/Cloudflare |

## Correcciones y limpieza controlada

1. Se hizo determinista el orden del build del monorepo.
2. Se eliminó el fallback silencioso del CRM hacia SQLite. La compatibilidad sólo se activa con `CRM_SOURCE=sqlite` y su test lo declara antes de importar la app.
3. No se eliminó ningún archivo: los artefactos legacy aún tienen referencias de migración, auditoría o tests; borrarlos sin completar el corte de datos violaría retención.
4. No se generó SQL correctivo: no existe un problema de datos demostrado. Sólo se agregó diagnóstico/validación de lectura.

## Riesgos y cierre operativo pendiente

1. Ejecutar el SQL 07 en DBeaver y archivar su salida PASS/FAIL.
2. Crear un `pg_dump` nuevo desde el entorno aprobado y registrar ubicación/hash fuera de Git.
3. Ejecutar migraciones sólo después del backup; no se ejecutaron durante esta auditoría.
4. Hacer smoke autenticado de INICIO, ECONOMÍA, CRM y MIGRACIÓN, comparar con las consultas del SQL 07 y probar logout/F5.
5. Validar Cloudflare desde el hostname oficial (cookies, CORS y cabeceras); el túnel no forma parte de este contenedor.
6. Si todos los checks externos pasan, etiquetar el commit resultante como `checkpoint-pre-admin-2026-07-29`; no iniciar Administración antes.
