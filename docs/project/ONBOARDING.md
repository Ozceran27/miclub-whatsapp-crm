# Onboarding

## Contrato actual

Siete pantallas implementadas; shared contracts/onboarding.ts define ONBOARDING_DRAFT_CONTRACT_VERSION=2 y la política compartida:

| Paso | Contenido | Obligatorio |
| --- | --- | --- |
| 1 | Bienvenida | Sí |
| 2 | Saldos iniciales | Sí |
| 3 | Sectores | No |
| 4 | Trabajadores/Instructores | No |
| 5 | Actividades | No |
| 6 | Plan y guía de migración | No |
| 7 | Revisión/finalización | Sí |

Saldos exige currency, cash, bank, usdCash no negativos; cero es válido. Monedas: ARS/USD/BRL/EUR. Los sectores system ya existen por provisioning. El draft permite configurar sectores, trabajadores e instructores nuevos y actividades con términos FIXED/VARIABLE.

## Persistencia y visibilidad

club_onboarding nace NOT_STARTED. COMPLETED/completed_at impide volver a mostrar el asistente, incluso sin movimientos/inscripciones. La visibilidad no depende sólo de conteos.

El borrador y navegación son temporales en el montaje web. F5 vuelve al paso 1 y descarta el borrador. current_step/completed_steps/skipped_steps son snapshots legacy; PATCH advance es compatibilidad sin persistencia de avance.

**C03 pendiente:** la documentación anterior prometía progreso persistido/F5 seguro. Describir el comportamiento temporal no aprueba retirar aquel requisito. La persistencia de finalización sí está implementada.

## Finalización

POST /api/onboarding/complete recibe draft v2 y selección de plan consistente. onboardingService valida workers; completeOnboardingDraft realiza en withTenantTransaction:

1. Advisory lock y consulta/registro de operación idempotente.
2. Validación de catálogo, plan e iconos.
3. Subscription, opening balances, sectores, workers y actividades/términos.
4. Asociación de fotos temporales.
5. COMPLETED, auditoría y resultado guardado.

Repetir la misma clave devuelve resultado; otra clave tras operación completada da conflicto. Fallo revierte escrituras DB. Las fotos pueden haber sido cargadas previamente: la atomicidad final no significa ausencia de archivos temporales anteriores.

POST opening-balances permanece como endpoint separado; no es el mecanismo de guardado de cada pantalla del draft actual. completeOnboarding antiguo permanece en repository sin ser la ruta moderna.

## Workers, actividades y fotos

Director inicial proviene del provisioning. Remuneración personal: fija opcional con monto/frecuencia/moneda; no porcentaje VARIABLE. El porcentaje de club pertenece a Activity Terms.

finalizeWorkers exige identidad nueva; si email ya existe rechaza. Administración posee flujo distinto de invitaciones (C02). No prometer reutilización/invitación dentro del draft.

Actividad referencia sector del draft e instructor; las escrituras económicas modernas no corrigen automáticamente la lectura FIXED antigua (B03).

Fotos: fileId opaco tenant, JPG/PNG/WebP hasta 5 MB y 4096 px; temporales 24 h. PRIVATE_UPLOAD_ROOT debe ser persistente si se conservan fotos activas; el default es tmpdir.

## Plan y migración

FREE/SOCIAL/COMPLEX/CLUB: selección validada en catálogo y activada sin cobro con origen pre_billing_onboarding, independientemente de BILLING_MODE disabled/sandbox/live. No hay tarjeta ni gateway operativo.

Migración se ejecuta después en su módulo, según permiso/entitlement efectivo. Completion devuelve destino MIGRATION o DASHBOARD. Evitar doble contabilización de opening balances e historia que ya contiene CAPITAL inicial; esta advertencia no sustituye una política de conciliación.

Fuentes: shared contracts/onboarding.ts; web modules/Onboarding/steps.tsx, OnboardingGate.tsx; API onboardingService, onboardingRepository, onboardingPhotoStore y billingService.
