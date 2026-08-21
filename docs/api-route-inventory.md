# Inventario de rutas API

**Generado y reconciliado:** 2026-08-16 a partir de los `Router` montados en `apps/api/src/index.ts`. Se inventarían rutas HTTP de API, no el fallback SPA de `frontendRoutes.ts`.

## Convenciones de acceso

- **Pública:** no requiere sesión (`/health`, login y registro condicionado por flag).
- **Sesión:** requiere autenticación; **tenant** añade membresía activa y toma `clubId` exclusivamente del contexto servidor.
- **Permiso/flag:** suma el control indicado. En producción la autenticación es obligatoria y no existe bypass.
- Los paths `legacy-compat` conservan contratos del frontend, pero sus datos provienen solo de PostgreSQL. Su retiro está previsto para el **2026-11-06**, después de migrar los consumidores enumerados en [`legacy-compat-audit.md`](legacy-compat-audit.md).

## Autenticación — montaje `/auth`

| Método | Path | Acceso |
| --- | --- | --- |
| POST | `/auth/login` | Pública; rate limit |
| POST | `/auth/register` | Pública; `PUBLIC_REGISTRATION_ENABLED=true`; rate limit |
| POST | `/auth/logout` | Endpoint auth; invalida sesión si existe |
| GET | `/auth/clubs` | Sesión |
| POST | `/auth/clubs/select` | Sesión; selecciona una membresía del usuario |
| GET | `/auth/me` | Sesión |

Fuente: `apps/api/src/routes/authRoutes.ts`.

## Salud, migración e importación

| Método | Path | Acceso |
| --- | --- | --- |
| GET | `/health` | Pública |
| GET | `/api/db/health` | Sesión + tenant |
| GET | `/api/db/enrollment-fee-audit` | Sesión + tenant + `finance:write` |
| GET | `/api/migration/template` | Sesión + tenant + `imports:run` + capacidad `data_migration`; descarga plantilla XLSX |
| POST | `/api/migration/uploads` | Sesión + tenant + `imports:run` + capacidad `data_migration`; dry-run o aplicación de lote XLSX |

Fuentes: `apps/api/src/routes/dbRoutes.ts`, `apps/api/src/routes/migrationUploadRoutes.ts` y `apps/api/src/routes/legacyCompatRoutes.ts`. El importador operativo acepta exclusivamente archivos XLSX y persiste lotes con origen canónico `xlsx_import`.

## Catálogos, personas y finanzas — montaje `/api`

Todas requieren sesión + tenant.

| Método | Paths GET | Fuente |
| --- | --- | --- |
| GET | `/api/sectors`, `/api/activities`, `/api/instructors` | `catalogRoutes.ts` |
| GET | `/api/movement-categories`, `/api/payment-methods`, `/api/currencies` | `catalogRoutes.ts` |
| GET | `/api/system-months`, `/api/discount-rates`, `/api/salon-hour-prices` | `catalogRoutes.ts` |
| GET | `/api/catalogs`, `/api/catalogs/:catalog` | `catalogRoutes.ts` |
| GET | `/api/people` | `peopleRoutes.ts` |
| GET | `/api/movements`, `/api/receivables`, `/api/payments` | `financeRoutes.ts` |
| GET | `/api/operational-balances`, `/api/sector-settlements` | `financeRoutes.ts` |
| GET | `/api/dashboard/basic`, `/api/sector-finance-summary` | `dashboardRoutes.ts` |

Los archivos fuente están bajo `apps/api/src/routes/`.

## Economía

Todas requieren sesión + tenant.

| Montaje | Paths GET | Fuente |
| --- | --- | --- |
| `/api/modules` | `/api/modules/navigation`, `/api/modules/economy/summary`, `/api/modules/economy/sector-balances`, `/api/modules/economy/movements` | `moduleRoutes.ts` |
| `/api/economy` | `/api/economy/summary`, `/api/economy/monthly-evolution`, `/api/economy/by-sector`, `/api/economy/sector-rankings` | `economyRoutes.ts` |
| `/api/economy` | `/api/economy/by-category`, `/api/economy/payment-methods`, `/api/economy/recent-movements`, `/api/economy/pending` | `economyRoutes.ts` |
| `/api/economy` | `/api/economy/annual-summary`, `/api/economy/yearly-breakdown`, `/api/economy/comparison`, `/api/economy/insights` | `economyRoutes.ts` |

## Administración y mutaciones operativas

Todas requieren sesión, membresía activa, tenant derivado por el servidor y rechazo de `clubId` enviado por el cliente. `updatedAt` es obligatorio en mutaciones con control optimista; crear un movimiento requiere además `Idempotency-Key`.

| Método | Path | Permiso efectivo |
| --- | --- | --- |
| GET | `/api/administration`, `/api/administration/summary`, `/api/administration/workers` | `administration.view` |
| PATCH | `/api/sectors/:id`, `/api/sectors/:id/status` | `sectors.edit` + acceso al sector |
| POST | `/api/sectors/:id/archive` | `sectors.archive` + acceso al sector |
| POST | `/api/activities` | `activities.create` + acceso al sector |
| PATCH | `/api/activities/:id`, `/api/activities/:id/status` | `activities.edit` + acceso al sector |
| POST | `/api/activities/:id/archive` | `activities.archive` + acceso al sector |
| GET / POST | `/api/tasks` | `tasks.view` / `tasks.create` |
| PATCH | `/api/tasks/:id`, `/api/tasks/:id/status` | `tasks.edit` |
| POST | `/api/tasks/:id/archive` | `tasks.edit` |
| GET | `/api/requests`, `/api/requests/:id` | `requests.view` |
| POST | `/api/requests/:id/approve`, `/api/requests/:id/reject` | `requests.approve` / `requests.reject` |
| POST | `/api/movements` | `movements.create` |
| PATCH | `/api/movements/:id` | `movements.edit` (`finance:write` sólo por compatibilidad temporal) |
| POST | `/api/movements/:id/void` | `movements.cancel` (`finance:write` sólo por compatibilidad temporal) |
| POST | `/api/inscripciones` | `enrollments.create` (`club:manage` sólo por compatibilidad temporal) |

Las lecturas `/api/sectores`, `/api/actividades`, `/api/movimientos` y `/api/inscripciones` pertenecen a `readOnlyRoutes.ts` y alimentan listas y detalles administrativos. La compatibilidad legacy está centralizada, vence el 2026-11-06 y su criterio de retiro queda registrado en [`legacy-compat-audit.md`](legacy-compat-audit.md); no forma parte del permiso canónico de las rutas.

## Compatibilidad PostgreSQL y CRM

Todas, salvo `/health` ya inventariada, requieren sesión + tenant.

| Método | Path | Condición adicional | Fuente |
| --- | --- | --- | --- |
| GET | `/members` | — | `legacyCompatRoutes.ts` |
| GET | `/debtors` | — | `legacyCompatRoutes.ts` |
| GET | `/summary` | — | `legacyCompatRoutes.ts` |
| GET | `/club-finance-summary` | — | `legacyCompatRoutes.ts` |
| GET | `/sector-operational-summary` | — | `legacyCompatRoutes.ts` |
| GET | `/sync-status` | — | `legacyCompatRoutes.ts` |
| GET | `/templates` | — | `crmRoutes.ts` |
| POST | `/templates` | `crm:write` | `crmRoutes.ts` |
| PATCH | `/templates/:id` | `crm:write` | `crmRoutes.ts` |
| DELETE | `/templates/:id` | `crm:write` | `crmRoutes.ts` |
| POST | `/templates/reset-defaults` | `crm:write` | `crmRoutes.ts` |
| GET | `/history` | — | `crmRoutes.ts` |
| PATCH | `/history/:id/status` | `crm:write` | `crmRoutes.ts` |
| GET | `/contacted-recent` | — | `crmRoutes.ts` |
| POST | `/prepare-messages/validate` | `crm:write` | `crmRoutes.ts` |
| POST | `/prepare-messages` | `crm:write` | `crmRoutes.ts` |

## Reconciliación respecto del inventario anterior

En la limpieza post-reset del 2026-08-16 se eliminaron `/club-finance-debug` y `/receivable-fees-effective-status-debug`, sin consumidores en el frontend ni en imports de runtime. Se incorporaron las rutas reales de registro/clubes, auditoría de cuotas, borrado controlado de inscripciones y el router completo `/api/economy`. Se retiraron del inventario `status-debug`, `payments-debug` y `sector-operational-debug`, porque no existen en los routers montados. Se corrigió además el path de auditoría de movimientos y se documentaron flags y permisos efectivos.

## Cómo regenerar

Revisar montajes en `apps/api/src/index.ts` y luego enumerar declaraciones estáticas y el arreglo dinámico de catálogos:

```bash
rg -n 'app\.use|router\.(get|post|patch|put|delete)|path:' apps/api/src/index.ts apps/api/src/routes
```

La salida requiere reconciliación humana de prefijos, loops, factories y feature flags; no debe publicarse como una lista de coincidencias sin resolver.
