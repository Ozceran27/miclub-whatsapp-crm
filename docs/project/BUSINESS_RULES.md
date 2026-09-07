# Business Rules

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

- INGRESO
- EGRESO
- CAPITAL

Los cálculos financieros ordinarios usan movimientos con estado `COMPLETADO`, salvo una regla explícita de otro dominio.

Ejemplo:

- saldo pendiente puede usar `PENDIENTE`.

## 6. Categorías

Existe un catálogo canónico de categorías.

La arquitectura observada utiliza:

- `category_catalog` como catálogo global;
- `movement_categories` como asociación/configuración tenant.

No duplicar listas canónicas en frontend, backend y SQL.

### Operativas

INSCRIPCIÓN, CUOTA, TURNOS, COMISIÓN, ALQUILER, EVENTOS, VENTAS, CLASES, CURSOS, ENTRADAS, ABONOS, RESERVAS, PARTIDO, SALARIOS, KIOSCO, BEBIDAS, COMIDAS, CMV.

### No operativas

PUBLICIDAD, DEPÓSITOS, EXTRACCIONES, DÓLARES, REPARACIONES, MANTENIM., VIÁTICOS, GANANCIA, PÉRDIDA, SEGUROS, LIMPIEZA, LIBRERÍA.

### Impuestos

TASAS, FIRMAS, IMPUESTOS.

### Servicios

LUZ, AGUA, INTERNET, GAS, TELEFONÍA.

### Pasivos

DEUDA.

Cualquier cambio en esta clasificación debe reconciliarse con el catálogo real y los cálculos existentes.

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
