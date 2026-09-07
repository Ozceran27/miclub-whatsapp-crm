# Architecture

## Alcance y autoridad

Sincronizado con el bootstrap aprobado del commit 42b81a3 (2026-09-07). Código runtime y migraciones son autoridad de implementación; [CURRENT_STATE.md](CURRENT_STATE.md) distingue bugs de comportamiento aceptado. No certifica PostgreSQL desplegado.

## Monorepo y runtime

- npm workspaces apps/* y packages/*.
- apps/api: Node, Express, TypeScript, pg y tsx; entrypoint src/index.ts.
- apps/web: React 18, Vite, TypeScript, Recharts; router propio (src/router.tsx).
- packages/shared: contratos HTTP/dominio, permisos, catálogos visuales y categorías, normalización monetaria/estados.
- docs y scripts: documentación y herramientas operativas, no parte del runtime ordinario.

Browser → React → Express → auth/membership/permisos → servicios/repositorios → PostgreSQL.

La separación por capas es heterogénea: activities, movements, enrollments, tasks y requests tienen rutas que llaman directamente a repositories. Worker mutation, provisioning, billing y parte de dashboards contienen SQL en services. No crear services/repositorios paralelos suponiendo una capa ausente.

## Frontend

SessionProvider rehidrata /auth/me, cambia membership y propaga logout entre pestañas. apiFetch centraliza transporte y expiración. serverState/client.ts implementa QueryClient/useServerQuery propios: no hay TanStack React Query. queryKeys incluye club, recurso, filtros, paginación y versión; TenantCacheBoundary cancela/retira cache al cambiar club.

Módulos: Inicio, Economía, Administración, CRM, Migración y Onboarding. Conviven DTO compartidos, respuestas normalizadas genéricas y contratos legacy. Ver DOMAIN_MODEL para consumidores.

## PostgreSQL y tenancy

db/postgres.ts separa pool runtime (SET ROLE miclub_runtime) y administrativo (migraciones/jobs). db/transaction.ts proporciona withTransaction y withTenantTransaction; el segundo establece app.club_id y app.current_club_id con alcance local a transacción.

El tenant HTTP deriva de User → membership activa → club. Predicados SQL y FKs compuestas son necesarios además de RLS. RLS se fuerza en tablas prioritarias; no hay cobertura universal. B02: múltiples repositorios todavía usan pool/withTransaction sin el contexto requerido. No describir el aislamiento como certificado.

Startup valida configuración productiva y schema onboarding; diagnostica permisos. Producción exige AUTH_ENABLED, secreto de sesión, DATA_SOURCE/CRM_SOURCE postgres y PUBLIC_APP_URL HTTPS. No hace seed ni provisioning automático de clubes.

## Migraciones

migrationManifest.ts define las 94 entradas y orden raíz/multitenant. runMigrations verifica inventario, hashes LF y dependencias; migrationCompatibility transforma dos migraciones históricas al instalarlas. Ledger: public.miclub_schema_migrations.

La secuencia no crea todos los objetos requeridos desde vacío: existen prerrequisitos históricos/manuales (B01). La coincidencia de hashes no certifica instalación limpia. Ver DATA_MODEL y TESTING.

## Fuentes y compatibilidad

PostgreSQL es la única fuente operacional. dataSourceService y crmService devuelven postgres. googleapis no es dependencia; sqlite3 permanece aislado en legacy/sqlite, sin fallback CRM runtime.

Rutas raíz /members, /debtors, /summary y otras, así como endpoints CRM, mantienen contratos consumidos por frontend sobre PostgreSQL. Coexisten lecturas /api en español/inglés, dashboardService y postgresDashboard/*; no asumir que todo es código muerto.

Candidatos: LoginScreen.tsx, EconomyComparisonCards.tsx, JS en docs/legacy-generated-js, completeOnboarding antiguo, fallback workers sin employees y calculador TS de settlement sin consumidor runtime. No eliminados.

## Límites pendientes

Además de B01/B02: escritura FIXED versus lectura SQL antigua, ciclo de liquidaciones incompleto y catálogos de clasificación duplicados. docs/runtime-boundaries.md aún describe carga dinámica SQLite y una ruta XLSX obsoletas; no usar esos pasajes para reconstruir runtime.

Fuentes: apps/api/src/index.ts, db/*, routes/*, services/crmService.ts, services/dataSourceService.ts; apps/web/src/session.tsx, router.tsx, serverState/*; package.json de los tres workspaces.
