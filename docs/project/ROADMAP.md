# Roadmap

## Checkpoint actual

Bootstrap del repositorio completado sobre 42b81a3; documentación docs/project sincronizada con el informe aprobado. No se corrigieron código ni SQL. Evidencia y bugs en CURRENT_STATE.

## Prioridad inmediata — instalación y operación real aislada

1. Resolver B01: instalación autocontenida desde schema vacío, sin depender de DDL manual histórico no versionado.
2. Resolver B02: contexto RLS en operaciones runtime; probar tanto operaciones válidas como aislamiento A/B.
3. Corregir B03/B04/B05/B06: FIXED, ANULADO importado, sectores system y revocación de invitaciones.
4. Definir/materializar ciclo de liquidación e invitaciones (C01/C02), decidir persistencia intermedia y signo proyectado (C03/C04), reconciliar clasificación duplicada (C05).
5. Recuperar gates locales; distinguir fallos de tooling/fixtures de bugs operativos.

## First Clean Club E2E

En PostgreSQL descartable: registro/rollback → login → onboarding/saldos/sectores/workers/actividad/plan → finalización → Inicio → XLSX dry-run/apply → Economía/Administración/CRM → logout. Validar paridad financiera y ausencia de cruces tenant.

## Database reset readiness

Después de certificar lo anterior: backup/restauración, ledger/schema/grants, scripts manuales vigentes y evidencia de entorno/commit. B07 (manifiesto de tenant-deletion incompleto) requiere corrección SQL separada. No ejecutar reset para descubrir si la instalación funciona.

## Posterior

UX, accesibilidad visual real, permisos, observabilidad, performance y hardening. Billing real sólo con requerimiento separado; selección actual es pre-billing sin cobro.

Fuera de alcance: reintroducir Sheets, mega-refactor, reparar historia sin necesidad y SQL destructivo automático contra DB real.
