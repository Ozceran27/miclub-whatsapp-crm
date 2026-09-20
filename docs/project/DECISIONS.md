# Decisions

## DEC-001 — PostgreSQL es la fuente operacional autoritativa

**Status:** Accepted

No hay fallback productivo a Sheets, mocks o SQLite.

---

## DEC-002 — Google Sheets fuera del runtime

**Status:** Accepted

Import histórico vía XLSX.

---

## DEC-003 — Tenant deriva de sesión/membership

**Status:** Accepted

El cliente no decide clubId.

---

## DEC-004 — Migration Manifest define orden ejecutable

**Status:** Accepted

No inferir orden por filesystem ni modificar migration aplicada sin transición.

---

## DEC-005 — Registro aprovisiona tenant completo en transacción

**Status:** Accepted

Club, identidad, membership Director, employee Director, onboarding, sectores system y datos iniciales coherentes; falla → rollback.

---

## DEC-006 — Sectores operativos se identifican por UUID

**Status:** Accepted

Nombre/code no son claves financieras.

---

## DEC-007 — Términos económicos son históricos

**Status:** Accepted

Cambios actuales no reescriben períodos anteriores.

---

## DEC-008 — VARIABLE guarda share del club

**Status:** Accepted by product direction

`club_share_percentage` representa al club; responsable recibe complemento.

---

## DEC-009 — Settlement allocations no fraccionan movimientos

**Status:** Accepted

PAYMENT/ADVANCE indivisible por allocation activa.

---

## DEC-010 — XLSX es contrato versionado

**Status:** Accepted

Cambios incompatibles requieren nueva versión.

---

## DEC-011 — RBAC y features son capas distintas

**Status:** Accepted

Permiso del actor != entitlement comercial.

---

## DEC-012 — SQL real se ejecuta manualmente en DBeaver

**Status:** Accepted para el flujo actual

Codex genera scripts; no ejecuta destructivo sobre DB real sin autorización explícita.

---

## DEC-013 — ChatGPT/Work/Codex comparten contexto mediante el repo

**Status:** Accepted

`AGENTS.md`, `docs/project/`, docs canónicas y Git son la memoria técnica compartida.

---

## DEC-014 — Selección pre-billing existente

**Status:** Implemented; reconciliado por bootstrap aprobado, no nueva decisión de cobro.

FREE/SOCIAL/COMPLEX/CLUB se activan sin pago al finalizar onboarding, con origen pre_billing_onboarding e independientemente de BILLING_MODE. Evidencia: billingService.ts, onboardingRepository.ts, migración 202609050001 y commit 7f38030. No implica gateway/billing real.

## DEC-015 — Corrección documental de categorías y vocabulario

**Status:** Confirmed by approved bootstrap.

CMV es NON_OPERATIONAL/EGRESOS; la descripción previa como operativo estaba desactualizada (shared movementCategoryCatalog, migración 202609050003, ff0a88b). Los tipos técnicos son INGRESOS/EGRESOS/CAPITAL y OPERATIONAL/NON_OPERATIONAL. No cambiar fórmulas financieras por esta corrección de documentación.

## DEC-017 — Circuito financiero mensual aprobado (2026-09-09)

**Estado: aprobado para implementación; no equivale a circuito desplegado.**

Dirección aprobó las etapas A–E: historia y permisos; cobros/correcciones y
devoluciones; liquidación mensual por persona; proyecciones compartidas;
arranque e importación conciliada. Las reglas completas están en FINANCIAL_MODEL.
Esta decisión resuelve C01 y C04 como definición de producto; sus brechas de
implementación siguen abiertas hasta verificar los recorridos integrados.

No se deduce el receptor histórico desde el instructor actual. No se borra un
pago cuando se corrige el ingreso. El exceso pagado queda como deuda de su
receptor (60000 pagados − 48000 de derecho corregido = 12000 de deuda).

## DEC-018 — Administración es la superficie permanente de configuración

**Status:** Accepted e implementado en código el 2026-09-19; despliegue SQL pendiente.

Onboarding conserva su borrador atómico, pero Administración reutiliza sus patrones
de formulario para mutaciones inmediatas. Sectores, trabajadores, instructores y
actividades son tenant-scoped; eliminar significa archivar. El Instructor operativo
y el receptor económico son relaciones distintas. Las remuneraciones se versionan,
generan obligaciones aprobables y se netean por persona/moneda con actividades.
Los fijos usan vencimientos completos, sin prorrateo. Ajustes, pagos, anulaciones y
reemplazos de apertura preservan historia y exigen motivo e idempotencia.

Los sectores de sistema `administracion` y `tesoreria` se enlazan conceptualmente
a los módulos núcleo Administración y Economía Club; se conservan como entidades
tenant para referencias y permisos, pero se excluyen de las pestañas sectoriales
dinámicas. `areas-comunes` conserva su pestaña independiente.

## Decisiones pendientes (sin aceptación implícita)

DEC-016 — Confirmado por dirección 2026-09-09: liquidación por mes del cobro,
señas incluidas al cobrar, recaudación siempre recibida por el club y déficit
FIXED como deuda del responsable. Nueva importación v3 con Actividad explícita;
conceptos históricos requieren asociación revisada. Ver BUSINESS_RULES e
IMPORT_SYSTEM para alcance implementado y decisiones financieras pendientes.

| ID | Decisión por resolver | Implementación observada |
| --- | --- | --- |
| C03 | Persistencia intermedia de onboarding | Finalización persistente; draft/avance temporal, F5 reinicia; promesa previa no retirada por esta auditoría |
| C05 | Retiro/reconciliación de clasificación fallback | economyDomain conserva listas distintas del catálogo |

C01, C02 y C04 quedaron resueltos en código por DEC-017/018: el runtime
materializa liquidaciones, existe bandeja autenticada de invitaciones y el neto
resta las obligaciones al responsable. Su certificación de entorno continúa
dependiendo de aplicar la migración manual y ejecutar el E2E PostgreSQL.

B01–B07 en CURRENT_STATE son defectos/brechas a corregir, no ADRs aceptados. Las decisiones DEC-001–013 y los ejemplos financieros permanecen vigentes.
