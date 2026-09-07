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
