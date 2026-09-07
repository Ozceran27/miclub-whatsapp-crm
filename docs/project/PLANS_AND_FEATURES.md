# Plans and Features

## Implementación auditada

Planes comerciales FREE, SOCIAL, COMPLEX, CLUB. Provisioning asigna FREE. DEVELOPMENT está reservado a testing, no es un quinto plan comercial.

features/plans/plan_entitlements son globales; club_subscriptions y club_capabilities son tenant. readCommercialPlanCatalog obtiene metadata de presentación de PostgreSQL. shared contracts/commercialPlans.ts define contratos.

## Entitlements efectivos

hasFeature en clubCapabilityService: override vigente más reciente (incluido disabled) prevalece; si no existe, subscription vigente con billing_status=active y entitlement. DATA_MIGRATION: FREE no, otros tres sí salvo override.

RBAC es separado: import exige imports:run, operador opcional y feature efectiva; seleccionar plan no concede permiso al usuario.

## Pre-billing

billingService.prepareOnboardingSelection activa cualquiera de los cuatro planes sin pago, independientemente de BILLING_MODE disabled/sandbox/live. Origen pre_billing_onboarding; misma transacción de finalización del draft y auditoría. No se piden tarjetas/comprobantes.

202609050001 versiona ese origen. BILLING_MODE=live no implica cobro actual. confirmLivePayment y billing_payment_confirmations preparan una frontera futura; no hay gateway operativo certificado.

Fuentes: provisioning, clubCapabilityService, billingService, planCommercialCatalog; migrations 202608140007, 202608160001, 202609010004/5, 202609050001. No implementar billing real sin tarea explícita.
