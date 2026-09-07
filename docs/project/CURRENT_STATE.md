# Current State

> **Tipo de documento:** snapshot de dirección.  
> **Última actualización de este paquete:** 2026-09-07.  
> **Importante:** reconciliar contra el checkout local antes de asumir que refleja cambios no pusheados.

## Checkpoint observado en `main`

La aplicación ya se presenta como un monorepo con:

- `apps/api` — Express + TypeScript.
- `apps/web` — React + Vite + TypeScript.
- `packages/shared` — contratos/tipos compartidos.
- PostgreSQL como fuente autoritativa de producción.
- Autenticación obligatoria en producción.
- Tenant derivado desde sesión/membership.
- Registro público condicionado por `PUBLIC_REGISTRATION_ENABLED=true`.
- Importación XLSX autenticada.
- Google Sheets retirado del runtime productivo.
- Planes comerciales `FREE`, `SOCIAL`, `COMPLEX` y `CLUB`.
- Billing todavía no implementado como cobro real.
- Herramientas de migration manifest, readiness, tenant isolation y public registration presentes en scripts del repo.

## Provisioning de club observado

El flujo actual de registro usa una transacción y un servicio de provisioning que crea, como mínimo:

- club;
- suscripción `FREE`;
- registro de onboarding `NOT_STARTED`;
- roles tenant;
- usuario;
- persona;
- membership con rol Director;
- relación de empleado Director;
- sectores de sistema:
  - Administración
  - Tesorería
  - Áreas Comunes
- medios de pago iniciales;
- categorías tenant vinculadas al catálogo global.

## Runtime y seguridad observados

La API monta:

- autenticación;
- protección de rutas;
- membresía requerida para rutas tenant;
- rechazo de `clubId` suministrado por cliente;
- CSRF;
- CORS;
- headers de seguridad;
- rate limiting de auth/import;
- request IDs;
- diagnóstico de permisos en startup.

## Importación

El contrato documentado vigente utiliza `Modelo_Import_miClub.xlsx` y las hojas:

- `ADMINISTRACIÓN`
- `INSCRIPCIONES`

El importador soportado es XLSX. La documentación canónica indica que Google Sheets fue retirado definitivamente del runtime.

## Estado de readiness

El repositorio contiene un gate específico previo a reset en:

`docs/pre-reset-readiness.md`

Ese documento aclara correctamente que **la existencia de scripts o documentación no certifica que hayan sido ejecutados en un entorno**.

Por eso, antes del próximo reset real debe conservarse evidencia concreta de:

- commit;
- environment;
- backup/restauración;
- migration ledger;
- checks;
- smoke tests;
- aislamiento tenant.

## Diferencias que deben reconciliarse localmente

El contexto de producto dirigido recientemente define un walkthrough inicial de siete pantallas con:

1. Bienvenida.
2. Saldos.
3. Sectores.
4. Trabajadores/Instructores.
5. Actividades.
6. Migración.
7. Finalización.

La documentación `docs/onboarding.md` observada en `main` describe una secuencia canónica diferente y más orientada al backend/configuración/plan.

**No asumir cuál es la implementación final sin auditar el checkout local.**  
El bootstrap de Codex debe comparar:

- UI actual;
- `onboardingRoutes`;
- `onboardingService`;
- contratos shared;
- docs canónicas;
- este objetivo de producto.

## Próximo milestone recomendado

**Clean Database E2E / First Club Journey**

Antes:

1. sincronizar documentación con checkout local;
2. certificar migrations desde schema limpio;
3. certificar zero-tenant startup;
4. preparar SQL de reset manual;
5. ejecutar precheck/reset/postcheck en DBeaver.

Después:

1. registrar usuario nuevo;
2. crear club;
3. login;
4. onboarding;
5. configurar datos;
6. XLSX dry-run;
7. import real;
8. validar Inicio/Economía/Administración/CRM.

## Estado a completar por Codex local

- Branch:
- Commit:
- Git status:
- Última migration:
- Typecheck:
- Build:
- Tests:
- Migration manifest:
- Tenant isolation:
- Public registration integration:
- Empty database journey:
- `READY FOR DATABASE RESET`:
- `READY FOR CLEAN E2E`:
