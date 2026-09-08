# Current State

## Checkpoint auditado — 2026-09-07

Bootstrap aprobado, basado en código, migraciones y tests locales. No se conectó a PostgreSQL real. Describe el repositorio, no certifica el entorno desplegado.

| Elemento | Evidencia |
| --- | --- |
| Branch / commit | main / 42b81a363c4eee04dd4d3bbaceaff116d7c26891 |
| Working tree al auditar | Limpio |
| Migraciones | 94 entradas; orden en apps/api/src/scripts/migrationManifest.ts |
| Última migración | 202609050003_classify_cmv_as_non_operational.sql |
| Typecheck / build | Aprobados en los tres workspaces |
| Tests locales | 465: 458 aprobados, 7 fallidos |
| Lint raíz | 282 errores, 578 warnings |
| Deadcode | Falló; candidatos pendientes de revisión |
| Integraciones DB / E2E limpio | No ejecutados |
| Ledger/schema desplegado | No inspeccionados |
| READY FOR DATABASE RESET | NO |
| READY FOR CLEAN E2E | NO: instalación y bugs pendientes |

Los resultados corresponden al bootstrap; no son checks reejecutados por esta edición documental. Ver [TESTING.md](TESTING.md).

## Implementación actual

- Monorepo npm: Express/TypeScript en apps/api, React/Vite en apps/web, contratos en packages/shared. Router y cache web propios.
- PostgreSQL operacional; Google Sheets y SQLite no son fallback runtime.
- Registro condicionado por auth y PUBLIC_REGISTRATION_ENABLED=true. Provisioning transaccional: club, FREE, onboarding NOT_STARTED, roles, User, Person, membership/employee Director, sectores system, medios de pago y categorías tenant. No inicia sesión automáticamente.
- Sesión firmada, revalidación de membership, permisos backend y revocación al logout. Tenant derivado de identidad autenticada.
- Onboarding: Bienvenida, Saldos, Sectores, Trabajadores, Actividades, Plan/Migración y Finalización. Draft v2 temporal; F5 reinicia. Finalización persistente, atómica e idempotente.
- Workers con remuneración fija opcional, frecuencia y moneda; Instructor es relación separada con Person. Administración invita identidades existentes; el draft actual las rechaza.
- Actividades con términos históricos VARIABLE/FIXED; sectores dinámicos, templates globales y capacidad ENROLLMENTS/INCOME.
- Movimientos, inscripciones, lecturas de pagos/deudas, Inicio, Economía, Administración y CRM presentes, con contratos canónicos y de compatibilidad.
- XLSX efectivo v2: Modelo_Import_miClub.xlsx; ADMINISTRACIÓN A:Z e INSCRIPCIONES A:U; dry-run y apply.
- FREE/SOCIAL/COMPLEX/CLUB. Onboarding activa cualquiera sin cobro, incluso en BILLING_MODE=live; origen pre_billing_onboarding.
- Cuentas/saldos iniciales y valoración multimoneda con cotizaciones y trazabilidad PostgreSQL.

## Hallazgos abiertos

No son reglas aceptadas. A = documentación desactualizada; B = bug; C = ambiguo; D = legacy.

| ID | Clase | Hallazgo / evidencia |
| --- | --- | --- |
| B01 | B | Instalación vacía no autocontenida: objetos necesarios dependen de schema previo o DDL manual. Ver DATA_MODEL. |
| B02 | B | Activities, movements, enrollments y CRM acceden a tablas protegidas sin contexto transaccional RLS. Ver TENANCY_AND_RBAC. |
| B03 | B | Vista/lecturas FIXED usan monthly_fixed_fee; escrituras usan fixed_club_fee, frecuencia y moneda. |
| C01 | B/C | No se encontró creación runtime de activity_settlements; calculador TS sólo consumido por tests; vistas requieren liquidaciones COMPLETADO existentes. |
| B04 | B | XLSX admite ANULADO pero workbook.ts lo transforma en COMPLETADO. |
| B05 | B | readOnlyRepository.ts devuelve true as is_system para todos los sectores. |
| B06 | B | Ruta worker invitations no revalida revocación de sesión como /auth/me. |
| C02 | B/C | No se encontró entrega del token; aceptar invitación/cambiar rol no sincroniza Instructor como alta nueva. |
| B07 | A/B | SQL manual tenant-deletion conserva 91 entradas; faltan las tres migraciones del 5 de septiembre. No corregido por esta sincronización. |
| C03 | C | Decidir persistencia intermedia de onboarding: draft temporal versus promesa documental anterior de progreso/F5. |
| C04 | C | projectedBalance suma saldo positivo adeudado al responsable: aclarar semántica/signo. |
| C05 | C/D | economyDomain conserva clasificación duplicada; fallback SALARIOS diverge del catálogo. |

Otros riesgos: PGSSL desactiva verificación de certificado; trust proxy=true requiere frontera de proxy definida; fotos usan directorio temporal por defecto. No se inspeccionó configuración real.

## Historia relevante

- 42b81a3: agrega AGENTS y docs/project.
- 6f84fbd: migración CMV compatible con categorías sin code.
- ff0a88b: CMV no operativo.
- d686d71: corrige estado financiero de opening balances.
- 7f38030: selección de plan sin cobro en onboarding.

## Próximo milestone

1. Completar instalación reproducible y probar operaciones válidas bajo miclub_runtime en PostgreSQL descartable.
2. Corregir bugs RLS, liquidaciones, importación, sectores e invitaciones; resolver C01–C05 explícitamente.
3. Reparar gates locales y certificar registro, aislamiento A/B y First Clean Club Journey.
4. Sólo después preparar readiness de reset real con backup/restauración, ledger y SQL manual revisado.

La existencia de scripts no prueba ejecución. Rige docs/pre-reset-readiness.md; el reset real no es el próximo paso automático.
# Verificación RC — 2026-09-08

Trabajo sin commit sobre `bec17e642b3a6f151aaab62a51b179926a7da5bb`.
La implementación del plan RC está **parcial**, no certificada. El inventario
de tareas y límites se mantiene en [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md).
La corrección del error de saldos fue reproducida y validada en PostgreSQL aislado;
requiere SQL manual en la base real, detallado en [ONBOARDING.md](ONBOARDING.md).
No se ejecutó reset ni SQL modificador en la base real.
