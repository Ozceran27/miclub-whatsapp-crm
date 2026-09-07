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

## Decisiones pendientes (sin aceptación implícita)

| ID | Decisión por resolver | Implementación observada |
| --- | --- | --- |
| C01 | Ciclo de creación, cálculo y cierre de liquidaciones | Tablas/vistas presentes; no hay creador runtime encontrado; lectura FIXED desalineada |
| C02 | Entrega/aceptación de invitaciones y lifecycle Instructor | Token sólo hasheado; entrega no encontrada; caminos de alta/actualización divergen |
| C03 | Persistencia intermedia de onboarding | Finalización persistente; draft/avance temporal, F5 reinicia; promesa previa no retirada por esta auditoría |
| C04 | Significado/signo del saldo proyectado | Suma saldo positivo adeudado al responsable |
| C05 | Retiro/reconciliación de clasificación fallback | economyDomain conserva listas distintas del catálogo |

B01–B07 en CURRENT_STATE son defectos/brechas a corregir, no ADRs aceptados. Las decisiones DEC-001–013 y los ejemplos financieros permanecen vigentes.
