# API Contracts

## Lecturas administrativas — 2026-09-24

`GET /api/administration/workers` requiere `administration.view` y
`workers.view`. El editor de Actividades consulta
`GET /api/administration/activity-workers` con `administration.view` y
`activities.view`; devuelve sólo `id`, `personId`, nombre y rol de empleados
activos del tenant. `GET /api/administration/activity-sectors` entrega sólo
sectores activos visibles para elegir el sector de la actividad. La lectura
financiera legacy `GET /api/administration`
requiere además `finance:read`. En `/summary`, el valor `null` significa que
el read model no calcula ese indicador; no debe presentarse como cero.
En `trends.points`, `income`, `expenses` y `balance` también son `null` hasta
contar con una valoración homogénea por moneda; `movements` y `enrollments`
siguen siendo conteos reales.

## Saldos de trabajadores — 2026-09-23

`GET /api/administration/workers/balances?page=N&limit=20` requiere sesión, membresía, `administration.view`, `workers.view` y `finance:read`. Devuelve `{asOf,scope,items}`; cada elemento incluye `workerId`, `personId`, `status` (`AVAILABLE` o `INCOMPLETE`) y `amounts` por moneda con importe firmado y `pendingReview`. `scope` es `ALL_SECTORS` o `VISIBLE_SECTORS`. No admite `clubId` del cliente y se entrega con `Cache-Control: private, no-store`. Un estado `INCOMPLETE` impide presentar un cero supuesto. El endpoint laboral general no incluye importes financieros.

## Actividades, precios e inscripciones — 2026-09-22

`POST /api/activities` exige `pricing: {enrollmentPrice, feePrice, feeFrequency, effectiveFrom}` sólo cuando `generatesEnrollments` es `true`; `schedules: [{weekday,startTime,endTime}]` sigue siendo obligatorio (admite `[]`). En `PATCH /api/activities/:id`, omitir `pricing`, `schedules` o `status` conserva cada valor; `pricing` se rechaza cuando `generatesEnrollments` es `false`. Reactivar inscripciones requiere un precio vigente o uno nuevo con vigencia aplicable. `GET /api/actividades` expone estado `active`/`inactive`, precio vigente, `pricingConfigured`, fechas civiles `YYYY-MM-DD` y bloques semanales. `GET /api/administration/activities/:id/prices` devuelve historial tenant-scoped con `cancelledAt` para las vigencias futuras canceladas; éstas no se aplican a nuevas inscripciones. `GET /api/administration/club-currency` devuelve la moneda base. `POST /api/inscripciones` admite `enrollmentPrice` editable, usa `feeAmount` para la cuota y deriva el término por club/actividad/fecha en el servidor. No admite autoridad tenant ni término de precio desde el cliente.

Resumen. El inventario detallado canónico es `docs/reference/api-routes.md`.

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

`GET /api/administration/workers` devuelve un `version` opaco por trabajador.
`PUT /api/administration/workers/:id` y `DELETE /api/administration/workers/:id`
lo exigen y lo comparan en PostgreSQL sin normalizar el timestamp en JavaScript.
Una colisión real devuelve `409 OPTIMISTIC_CONCURRENCY_CONFLICT`; un esquema sin
`employees` devuelve `503 WORKER_MODEL_NOT_APPLIED`. La mutación admite
`removePhoto: true`, aplicado atómicamente al guardar.

Las mutaciones de actividades requieren `generatesEnrollments: boolean`.
`POST /api/activities` exige además `settlement` con `effectiveFrom`;
`PATCH /api/activities/:id` puede omitir `settlement` para una edición operativa.
Enviar un receptor económico sin nuevas condiciones es inválido.
`GET /api/administration/activities/:id/terms` devuelve todas las versiones con fase
`FUTURE`, `CURRENT` o `HISTORICAL` según la fecha local del club.

`GET /api/actividades` agrega `annualOperatingProfitability`,
`annualOperatingProfitabilityYear`, `annualOperatingMovements`,
`operatingCurrencyCode` y estado `AVAILABLE`, `NO_MOVEMENTS` o
`INCOMPLETE_EXCHANGE_RATE`. La definición financiera coincide con la documentada
en `BUSINESS_RULES.md`. Estos campos de rentabilidad se omiten del JSON si la
membresía no posee `finance:read`, aunque pueda consultar la actividad.

`GET /api/sectores` excluye archivados y agrega por sector
`annualOperatingProfitability`, `annualOperatingProfitabilityStatus`,
`annualOperatingProfitabilityYear` y `operatingCurrencyCode`. El importe
representa el resultado de categorías operativas completadas desde el inicio
del año local del club hasta hoy, convertido con la última cotización oficial
disponible a la fecha de cada movimiento. Si falta una cotización requerida, el
importe es `null` y el estado es `INCOMPLETE_EXCHANGE_RATE`; no se suman importes
nominales de monedas distintas ni se presenta un cero inventado.
Los campos anuales de rentabilidad del sector también se omiten sin
`finance:read`.

`POST /api/administration/sectors` admite `managerPersonId` nulo u omitido; si
se informa, debe identificar a una persona operativa activa del mismo club.
`GET /api/administration/sector-manager-candidates` devuelve el catálogo completo
de candidatos del tenant para el selector, sin paginarlo con la lista de trabajadores.
`PATCH /api/sectors/:id` usa `iconKey` como entrada canónica y sincroniza la
metadata visual persistida. Rechaza toda edición cuando `is_system=true`.
`PATCH /api/sectors/:id/status` permanece disponible para el estado operativo.
`POST /api/sectors/:id/archive` conserva historia y rechaza sectores de sistema
o con trabajadores/actividades vigentes.

Además mutaciones de sectors, activities, tasks, requests, movements y enrollments.

## Concurrencia

El inventario vigente documenta:

- `updatedAt` en mutaciones con control optimista;
- `version` opaca en edición y archivado de trabajadores;
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
