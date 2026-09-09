# API Contracts

Resumen. El inventario detallado canónico es `docs/api-route-inventory.md`.

Auditado sobre 42b81a3. Una ruta presente no implica flujo E2E certificado. Ver CURRENT_STATE para bugs RLS y revocación en invitaciones.

## Acceso

- Pública: sin sesión.
- Sesión: auth requerida.
- Tenant: auth + membership.
- Permission/Feature: agrega autorización/capability.

## Auth

| Método | Ruta | Objetivo |
|---|---|---|
| POST | `/auth/login` | Crear sesión |
| POST | `/auth/register` | Registro público |
| POST | `/auth/logout` | Revocar sesión |
| GET | `/auth/clubs` | Memberships activas |
| POST | `/auth/clubs/select` | Seleccionar membership |
| GET | `/auth/me` | Contexto actual |
| POST | `/auth/worker-invitations/:decision` | Resolver invitación worker |

## Onboarding

- `GET /api/onboarding`
- `PATCH /api/onboarding/advance`
- `POST /api/onboarding/opening-balances`
- `POST /api/onboarding/photos`
- `DELETE /api/onboarding/photos/:fileId`
- `POST /api/onboarding/complete`

`advance` es compatibilidad de lectura, sin progreso persistido. `complete` consume draft v2 y selección de plan consistente; persiste todo en una operación idempotente. Opening-balances y photos son endpoints separados; la UI no guarda entidades en cada avance.

`GET /api/commercial-plans` requiere ONBOARDING_READ y devuelve catálogo para el paso 6.

## Migration XLSX

- `GET /api/migration/template`
- `POST /api/migration/uploads`

Requieren auth, tenant, permiso y capability comercial.

Versión efectiva v3: Actividad explícita en AA de ADMINISTRACIÓN. Apply exige
dry-run equivalente, incluidas las referencias resueltas. Sólo dry_run/apply;
retry/reversal se rechazan. Ver IMPORT_SYSTEM para transición desde v2.

## Catálogos

Ejemplos:

- `/api/sectors`
- `/api/activities`
- `/api/instructors`
- `/api/movement-categories`
- `/api/payment-methods`
- `/api/currencies`
- `/api/catalogs`

## Finance

- `/api/movements`
- `/api/receivables`
- `/api/payments`
- `/api/operational-balances`
- `/api/sector-settlements`

Las superficies anteriores son GET de lectura en financeRoutes. No implican CRUD de payments/settlements ni materialización de liquidaciones. Las mutaciones de movimientos están en movementMutationRoutes; inscripciones se crean en POST /api/inscripciones y cambian estado en PATCH /api/inscripciones/:id/estado.

## Economy

Bajo `/api/economy`: summary, evolution, by-sector, rankings, categories, payment methods, recent, pending, annual, comparison e insights.

## Administration

- `/api/administration`
- `/api/administration/summary`
- `/api/administration/workers`

Además mutaciones de sectors, activities, tasks, requests, movements y enrollments.

## Concurrencia

El inventario vigente documenta:

- `updatedAt` en mutaciones con control optimista;
- `Idempotency-Key` al crear movimientos.

No uniformar nombres sin revisar el handler: inscripciones usa expectedUpdatedAt; tareas/sectores usan updatedAt; onboarding usa clave dentro del draft. Parte de los DTO permanece local a repositories; otras respuestas son registros normalizados genéricos.

## Errores

Mantener semántica diferenciada:

- 400 invalid request
- 401 unauthenticated
- 403 forbidden
- 404 scoped resource missing/disabled surface
- 409 conflict
- 422 semantic validation
- 500 unexpected
- 503 configuration/dependency unavailable
