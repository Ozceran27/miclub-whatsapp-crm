# Business Rules

Sincronización del bootstrap aprobado (42b81a3, 2026-09-07). Se corrigen nombres técnicos y catálogo demostrados por código/migraciones. Los conflictos abiertos al final no autorizan cambios de reglas.

## 1. Multi-tenancy

Todo dato operativo tenant debe pertenecer inequívocamente a un club.

La autoridad tenant se deriva de sesión/membership.

Nunca usar como autoridad:

- `club_id` del body;
- `club_id` del query;
- `club_id` del XLSX;
- “primer club” de la base;
- UUID fijo.

## 2. PostgreSQL

PostgreSQL es la fuente operacional única.

No usar Google Sheets, mocks o SQLite como fallback de producción.

## 3. Sectores

Los sectores tenant se identifican por UUID.

Nombre y código visible no deben utilizarse como identidad financiera.

Sectores de sistema esperados al provisionar club:

- Administración.
- Tesorería.
- Áreas Comunes.

Su lógica debe basarse en códigos/system metadata, no en strings dispersos.

## 4. Personas e identidades

Evitar duplicar personas.

Distinguir:

- Person
- User
- Membership
- Employee/Worker
- Instructor
- Enrollment

DNI/email/teléfono pueden servir para validación o matching según dominio, pero no sustituyen PK técnica.

## 5. Movimientos

Tipos principales:

- INGRESOS
- EGRESOS
- CAPITAL

Estos son los valores técnicos del enum PostgreSQL; ingreso/egreso siguen siendo conceptos de negocio. Los cálculos financieros ordinarios usan `operational_status = 'COMPLETADO'`, salvo una regla explícita de otro dominio. `financial_status` es un eje distinto.

Ejemplo:

- saldo pendiente puede usar `PENDIENTE`.

## 6. Categorías

Existe un catálogo canónico de categorías.

La arquitectura observada utiliza:

- `category_catalog` como catálogo global;
- `movement_categories` como asociación/configuración tenant.

No duplicar listas canónicas en frontend, backend y SQL.

La lista anterior no coincidía con el catálogo activo. La fuente enumerada es `packages/shared/src/movementCategoryCatalog.ts`, asociada a PostgreSQL mediante provisioning y migraciones; no mantener aquí otra lista independiente.

Valores técnicos: `OPERATIONAL`, `NON_OPERATIONAL`, `TAX`, `SERVICE`, `LIABILITY` (no `OPERATIVE`/`NON_OPERATIVE`).

**Corrección probada:** CMV es `NON_OPERATIONAL`, dirección `EGRESOS`, desde `202609050003_classify_cmv_as_non_operational.sql` y el commit `ff0a88b`. Este documento decía operativo erróneamente. SALARIOS sigue `OPERATIONAL` en el catálogo shared; su clasificación fallback distinta en economyDomain es conflicto abierto C05, no cambio de regla.

## 7. Actividades

Una actividad tenant debe relacionarse con:

- club;
- sector;
- responsable/instructor cuando el modelo lo exige;
- términos económicos vigentes.

Responsable y sector deben pertenecer al mismo club.

## 8. Términos económicos

Los términos deben versionarse temporalmente cuando afectan historia.

La documentación actual indica `activity_terms` con:

- `effective_from`;
- `effective_to`.

No aplicar una comisión actual retroactivamente a períodos históricos.

## 9. Modalidad VARIABLE

`club_share_percentage` = porcentaje del club.

`responsible_share = 100 - club_share_percentage`.

## 10. Modalidad FIXED

El club tiene derecho al fee fijo definido para el período; el resto se determina por el modelo de liquidación vigente.

## 11. Saldo a Liquidar

No depende de Sheets.

### VARIABLE

`completed operational income × responsible share - settlements paid`

Ejemplo:

- Ingresos: 100000
- Club: 40%
- Responsable: 60%
- Liquidado: 20000
- Saldo: 40000

### FIXED

`completed operational income - fixed club fee - settlements paid`

Ejemplo:

- Ingresos: 500000
- Fee club: 150000
- Liquidado: 30000
- Saldo: 320000

No considerar automáticamente cualquier egreso de actividad como pago al responsable.

## 12. Allocation de liquidaciones

La regla documentada vigente establece que un movimiento `PAYMENT` o `ADVANCE` es una unidad indivisible y sólo puede pertenecer a una liquidación activa para ese tipo.

Si una operación real debe aplicarse a más de una liquidación, se registran movimientos separados.

Consultar `docs/business-rules/activity-settlement-allocations.md`.

## 13. Saldos iniciales

Deben ser auditables e integrados al modelo financiero.

No debe existir una segunda fuente de verdad desconectada de movimientos/ledger.

## 14. XLSX

Siempre:

```text
upload
→ validation
→ dry-run
→ apply
```

El import real se bloquea si existen errores contractuales o de referencias.

## 15. Matching de importación

Normalización permitida:

- trim;
- espacios repetidos;
- case folding;
- acentos;
- formas Unicode.

No usar fuzzy matching que pueda elegir otra entidad.

## 16. RBAC vs Planes

- RBAC: qué puede hacer una persona dentro del club.
- Plan/feature: qué capacidad comercial tiene habilitada el club.

## 17. Historial financiero

Preferir void/cancel/archive antes que delete físico para datos con historia.

## 18. Timezone

El provisioning observado crea clubes con `America/Argentina/Buenos_Aires`.

Los cálculos deben respetar timezone del club cuando el modelo permita personalizarlo.

## 19. Conflictos abiertos: no son reglas aceptadas

- B02: falta contexto transaccional RLS en consumidores; no relaja aislamiento tenant.
- B03/C01: lectura FIXED usa campo antiguo y no hay creación runtime de liquidaciones encontrada; se conservan las fórmulas y ambos ejemplos de la sección 11.
- B04: importar ANULADO como COMPLETADO es un bug; no habilita su conteo.
- C03: finalización onboarding persiste, pero draft/avance son temporales. Resolver explícitamente la promesa anterior de progreso persistido; no darla por eliminada.
- C04: aclarar significado/signo del saldo proyectado antes de cambiar la suma implementada.
- C02/C05: resolver lifecycle de Instructor/invitaciones y clasificación duplicada sin crear autoridades paralelas.

Detalles y fuentes en CURRENT_STATE, ONBOARDING, FINANCIAL_MODEL y TENANCY_AND_RBAC. Esta sincronización no implementa correcciones ni decisiones pendientes.
