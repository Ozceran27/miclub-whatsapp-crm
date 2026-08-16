# Auditoría de compatibilidad legacy post-reset

**Fecha de auditoría:** 2026-08-16. **Fecha prevista de retiro de las rutas raíz retenidas:** 2026-11-06.

Esta limpieza es posterior al reset y se limita a compatibilidad sin consumidores. No incluye fixes bloqueantes ni cambia contratos de negocio canónicos.

## Evidencia de consumidores

Se cruzaron tres fuentes: `npm run deadcode -- --reporter compact` (knip), el inventario `apps/api/src/contracts/api-route-inventory.json` y búsquedas de imports/paths con `rg`. El contrato ejecutable `legacyFrontendContract.test.ts` evita que una ruta raíz vuelva a quedar retenida sin aparecer en los clientes actuales.

| Superficie | Consumidor real | Decisión |
| --- | --- | --- |
| `/summary`, `/members`, `/debtors`, `/sync-status`, `/club-finance-summary`, `/sector-operational-summary` | `homeApi.ts`; las cuatro primeras también aparecen en `crmApi.ts` según su necesidad | Retener temporalmente hasta 2026-11-06. |
| `/health` | infraestructura y health checks; es pública | Retener como endpoint técnico, fuera del retiro de adaptadores de negocio. |
| `/club-finance-debug`, `/receivable-fees-effective-status-debug` | ninguno en `apps/web/src`; sólo estaban declaradas e inventariadas | Eliminar en esta fase post-reset. |
| `getMembersSource`, `isDebtorMember` | inyectados en `createCrmRoutes` para validar y preparar mensajes | Retener; no son código muerto. |
| `contracts/legacy.ts` | contratos `administration`, `auth`, `economy`, `http` y `migration`; además `asLegacyUnknownCode` se usa en API y web | Retener: preserva valores desconocidos almacenados/respuestas sin ensanchar los códigos conocidos. |
| `AuthenticatedContext.legacy` | login siempre emite `false`; `sessionService` rechaza sesiones antiguas y `context` lo expone | Retener hasta el retiro de sesiones pre-tenant; es una barrera de invalidación, no un adaptador muerto. |
| campos `legacySqliteId` del CRM | repositorio y servicio de migración/upsert; mantienen identidad de datos importados | Retener mientras existan filas migradas y constraints homónimos. |
| `AdministrationWorkersDataSource = "legacy"` | `workersRepository` informa fallback cuando no existen empleados normalizados | Retener hasta completar el backfill de empleados. |

Knip no marca `legacyCompatRoutes.ts` ni `contracts/legacy.ts` como archivos sin uso. Sus avisos globales preexistentes no se usaron como autorización para borrar contratos: la decisión exige confirmar el import o path consumidor.

## Retiro de las rutas conservadas

Antes del **2026-11-06** el frontend debe migrar las seis lecturas raíz a superficies `/api` canónicas. El retiro sólo puede ejecutarse cuando:

1. `rg` no encuentre esos paths en `apps/web/src`;
2. el inventario y el test del contrato frontend reflejen los reemplazos;
3. no haya tráfico observado para los paths raíz durante una ventana operativa acordada;
4. CRM deje de depender de los adaptadores `getMembersSource` e `isDebtorMember`, o los mueva a un servicio canónico.

Toda excepción debe registrar un consumidor concreto y una nueva fecha; un flag o una entrada de inventario por sí solos no cuentan como consumo.
