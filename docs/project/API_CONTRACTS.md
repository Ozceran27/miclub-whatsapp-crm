# API Contracts

Resumen. El inventario detallado canónico es `docs/api-route-inventory.md`.

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

## Migration XLSX

- `GET /api/migration/template`
- `POST /api/migration/uploads`

Requieren auth, tenant, permiso y capability comercial.

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
