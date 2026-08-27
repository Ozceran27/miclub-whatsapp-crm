# Capabilities de club

Las capabilities efectivas se resuelven con dos fuentes: un override vigente de `miclub.club_capabilities` tiene prioridad; de lo contrario se consulta el entitlement de una suscripción vigente con `billing_status='active'`. RBAC continúa siendo independiente: `DATA_MIGRATION` no reemplaza `imports.run`.

El catálogo canónico y único es `FREE`, `SOCIAL`, `COMPLEX`, `CLUB`. Los tres planes pagos tienen `DATA_MIGRATION`; Free no. `DEVELOPMENT`, planes inactivos y los códigos históricos no son elegibles. `GET /api/commercial-plans` expone en modo read-only esos cuatro planes y sus capabilities, deliberadamente sin precios.

Al completar onboarding, la suscripción se actualiza antes de resolver nuevamente el estado. Por eso Migración aparece inmediatamente para un plan activo. `pending_payment` modela la futura pasarela y no concede entitlements. Los cambios registran `onboarding.plan.change` en auditoría.
