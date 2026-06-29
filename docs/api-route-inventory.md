# Inventario de rutas API

Inventario actualizado de endpoints Express expuestos por `@miclub/api`. Los paths públicos se mantienen exactamente como están; los marcados como `legacy-compat` no deben renombrarse sin una migración coordinada del frontend.

| Método | Path público | Archivo fuente | Categoría |
| --- | --- | --- | --- |
| POST | `/auth/login` | `apps/api/src/routes/authRoutes.ts` | auth |
| POST | `/auth/logout` | `apps/api/src/routes/authRoutes.ts` | auth |
| GET | `/auth/me` | `apps/api/src/routes/authRoutes.ts` | auth |
| GET | `/api/db/health` | `apps/api/src/routes/dbRoutes.ts` | debug |
| GET | `/api/db/crm/audit` | `apps/api/src/routes/dbRoutes.ts` | migración |
| POST | `/api/db/crm/migrate` | `apps/api/src/routes/dbRoutes.ts` | migración |
| POST | `/api/import/google-sheets` | `apps/api/src/routes/importRoutes.ts` | migración |
| GET | `/api/import/google-sheets/movements/audit` | `apps/api/src/routes/importRoutes.ts` | migración |
| GET | `/api/import/batches` | `apps/api/src/routes/importRoutes.ts` | migración |
| GET | `/api/import/batches/:id/errors` | `apps/api/src/routes/importRoutes.ts` | migración |
| GET | `/api/modules/economy/summary` | `apps/api/src/routes/moduleRoutes.ts` | productivo |
| GET | `/api/modules/economy/sector-balances` | `apps/api/src/routes/moduleRoutes.ts` | productivo |
| GET | `/api/modules/economy/movements` | `apps/api/src/routes/moduleRoutes.ts` | productivo |
| GET | `/api/sectors` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/activities` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/instructors` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/movement-categories` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/payment-methods` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/currencies` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/system-months` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/discount-rates` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/salon-hour-prices` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/catalogs` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/catalogs/:catalog` | `apps/api/src/routes/catalogRoutes.ts` | productivo |
| GET | `/api/people` | `apps/api/src/routes/peopleRoutes.ts` | productivo |
| GET | `/api/movements` | `apps/api/src/routes/financeRoutes.ts` | productivo |
| GET | `/api/receivables` | `apps/api/src/routes/financeRoutes.ts` | productivo |
| GET | `/api/payments` | `apps/api/src/routes/financeRoutes.ts` | productivo |
| GET | `/api/operational-balances` | `apps/api/src/routes/financeRoutes.ts` | productivo |
| GET | `/api/sector-settlements` | `apps/api/src/routes/financeRoutes.ts` | productivo |
| GET | `/api/dashboard/basic` | `apps/api/src/routes/dashboardRoutes.ts` | productivo |
| GET | `/api/sector-finance-summary` | `apps/api/src/routes/dashboardRoutes.ts` | productivo |
| GET | `/api/dashboard-reconciliation` | `apps/api/src/routes/dashboardRoutes.ts` | productivo |
| GET | `/health` | `apps/api/src/routes/legacyCompatRoutes.ts` | productivo |
| GET | `/members` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/debtors` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/summary` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/admin-movements` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/club-finance-summary` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/sector-operational-summary` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/sync-status` | `apps/api/src/routes/legacyCompatRoutes.ts` | legacy-compat |
| GET | `/club-finance-debug` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/sector-operational-debug` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/status-debug` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/comparison-debug` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/comparison-debug/summary` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/comparison-debug/members` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/payments-debug` | `apps/api/src/routes/legacyCompatRoutes.ts` | debug |
| GET | `/templates` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| POST | `/templates` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| PATCH | `/templates/:id` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| DELETE | `/templates/:id` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| POST | `/templates/reset-defaults` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| GET | `/history` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| PATCH | `/history/:id/status` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| GET | `/contacted-recent` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| POST | `/prepare-messages/validate` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |
| POST | `/prepare-messages` | `apps/api/src/routes/crmRoutes.ts` | legacy-compat |

## Smoke manual sugerido

- **INICIO**: `GET /health`, `GET /sync-status`.
- **CRM**: `GET /members`, `GET /debtors`, `GET /templates`, `GET /history`.
- **MIGRACIÓN**: `GET /api/db/health`, `GET /api/db/crm/audit`, `POST /api/db/crm/migrate` con `dryRun: true`.
