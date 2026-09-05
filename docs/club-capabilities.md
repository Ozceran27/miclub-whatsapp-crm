# Capabilities de club

Las capabilities efectivas se resuelven con dos fuentes: un override vigente de `miclub.club_capabilities` tiene prioridad; de lo contrario se consulta el entitlement de una suscripción vigente con `billing_status='active'`. RBAC continúa siendo independiente: `DATA_MIGRATION` no reemplaza `imports.run`.

El catálogo canónico y único es `FREE`, `SOCIAL`, `COMPLEX`, `CLUB`. Los tres planes pagos tienen `DATA_MIGRATION`; Free no. `DEVELOPMENT`, planes inactivos y los códigos históricos no son elegibles. `GET /api/commercial-plans` expone en modo read-only esos cuatro planes y sus capabilities, deliberadamente sin precios.

Al completar onboarding, cualquiera de los cuatro planes se persiste inmediatamente con `billing_status='active'` y `selection_source='pre_billing_onboarding'`, sin cobro y antes de resolver nuevamente el estado. Por eso las capabilities del plan elegido aparecen de inmediato; la clasificación como plan pago es sólo informativa. `pending_payment` queda reservado para una futura pasarela y no participa del onboarding actual. Los cambios de Free a un plan pago, y viceversa, reemplazan idempotentemente la suscripción vigente dentro de la transacción.
