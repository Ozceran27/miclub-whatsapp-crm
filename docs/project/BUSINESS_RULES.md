# Business Rules

## Precios y horarios de actividades

Inscripción y cuota son cargos al alumno, no condiciones de reparto con el responsable. Ambos admiten `$0` y sólo enteros; la cuota requiere frecuencia diaria, semanal, mensual o anual. Son obligatorios al crear o reactivar una actividad que admite inscripciones sólo si no existe un precio vigente. Una actividad sin inscripciones no configura precios nuevos. Una nueva vigencia puede comenzar en el pasado dentro de un tramo existente: éste se cierra el día anterior y la nueva versión conserva el final previo. Una fecha de inicio ya ocupada con otros valores se rechaza; valores idénticos dentro del tramo no generan otra versión. Los snapshots de inscripciones previas nunca se reescriben. Al deshabilitar inscripciones se cancelan las vigencias futuras, se reabre la vigente y se conservan los registros cancelados para auditoría y referencias históricas. Un alta legacy sin precios permite inscripción manual con importes editables, por defecto cero. No se crean automáticamente movimientos ni cobros. Los horarios son locales a la zona del club, terminan el mismo día y no pueden solaparse dentro de una actividad.

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

En la navegación principal, Administración y Tesorería se representan mediante sus módulos núcleo.
Esos dos sectores persisten en
PostgreSQL pero no deben crear pestañas dinámicas duplicadas. Áreas Comunes sí
dispone de pestaña sectorial propia.

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

**Regla vigente:** toda categoría activa admite movimientos `INGRESOS` y `EGRESOS`. La dirección es atributo del movimiento; `movement_categories.direction` queda nulo como dato legado tras `202609250001_bidirectional_movement_categories.sql`. Los IDs y la clasificación histórica se conservan. CMV es `NON_OPERATIONAL` desde `202609050003_classify_cmv_as_non_operational.sql`. SALARIOS conserva la clasificación `OPERATIONAL` del catálogo canónico.

En pagos de liquidaciones, remuneraciones y cobros de deuda sólo se aceptan categorías canónicas `OPERATIONAL` o código `DEUDAS`. El cobro de deuda de un responsable, aun clasificado como operativo, no constituye una nueva recaudación de actividad ni se suma a su rentabilidad operativa.

## 7. Actividades

Una actividad tenant debe relacionarse con:

- club;
- sector;
- trabajador responsable operativo activo;
- términos económicos vigentes.

Responsable y sector deben pertenecer al mismo club.

`generates_enrollments` expresa si la actividad admite **nuevas** inscripciones.
Debe elegirse explícitamente al crear y editar. Desactivarlo no elimina ni cambia
inscripciones históricas; el backend rechaza cualquier alta nueva mientras esté
desactivado.

La rentabilidad operativa anual de una actividad es:

`ingresos operativos COMPLETADO - egresos operativos COMPLETADO`

Sólo se consideran movimientos vinculados por `activity_id`, desde el inicio del
año civil en la zona horaria del club hasta el instante actual. Cada moneda se
convierte a la moneda operativa con la última cotización oficial disponible a la
fecha del movimiento. Si falta una cotización necesaria, el importe agregado no
está disponible; nunca se suman nominales incompatibles.

## 8. Términos económicos

Los términos deben versionarse temporalmente cuando afectan historia.

La documentación actual indica `activity_terms` con:

- `effective_from`;
- `effective_to`.

No aplicar una comisión actual retroactivamente a períodos históricos.

El primer término exige `effective_from`. Una edición puramente operativa no
envía ni crea términos. Cambiar modalidad, porcentaje, importe, frecuencia,
moneda o receptor económico crea una versión nueva y exige una vigencia posterior
a la última versión, incluidas las versiones futuras ya programadas.

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

Consultar `docs/domains/business-rules/activity-settlement-allocations.md`.

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

## 19. Configuración administrativa y remuneraciones (vigente 2026-09-19)

- Archivar reemplaza eliminar para sectores, trabajadores, actividades y hechos
  financieros con historia.
- Toda actividad nueva o modificada exige un trabajador activo como responsable
  operativo mediante `responsible_employee_id`; puede ser Director, Instructor o
  Trabajador. `activity_terms.responsible_person_id` identifica al receptor
  económico versionado y sigue al responsable operativo por defecto.
- Un Instructor operativo se identifica con `instructors.status = 'activa'`; el
  esquema canónico no duplica ese estado mediante un booleano `is_active`.
- VARIABLE guarda el porcentaje del club. FIXED guarda el importe del club y su
  frecuencia DAILY/WEEKLY/MONTHLY/YEARLY.
- Cada vencimiento fijo se imputa completo a una fecha y a un único mes: diario
  por día activo, semanal cada siete días desde la vigencia, mensual al cierre del
  mes y anual en el aniversario. No se prorratea.
- La remuneración fija de un empleado es histórica e independiente. Sus
  obligaciones se generan como borradores y requieren aprobación; se suman a sus
  derechos por actividades.
- Procesar usa el neto por persona y moneda. Las deudas se compensan FIFO sin caja;
  cada porción con caja genera un movimiento propio dentro de un grupo anulable.
- Editar una liquidación crea un ajuste firmado y fuerza nueva revisión. Anular un
  grupo conserva registros, anula movimientos y allocations y recalcula saldos.
- Corregir saldos iniciales reemplaza el lote canónico mediante movimientos de
  reversión y nueva apertura; nunca inserta capital paralelo.

## 20. Conflictos abiertos: no son reglas aceptadas

### Definiciones confirmadas 2026-09-09

- Todos los cobros de actividades ingresan al club.
- Se asignan al mes de cobro, incluso si la cuota corresponde a otro mes.
- Las señas participan en la distribución cuando se cobran. Al cobrar el saldo
  de una reserva se registra sólo el remanente, para no volver a contar la seña.
- FIXED puede arrojar saldo negativo: cobrado 60000 menos fijo 85000 = -25000,
  deuda del responsable al club. No truncar a cero; debe conservarse para su
  compensación/cobro futuro, cuyo flujo se definirá con cierre y ajustes.
- Reservas y Señas se incorporan como ingresos OPERATIONAL al catálogo canónico.

Estas reglas no certifican el circuito runtime de liquidaciones. La siguiente
etapa debe definir devoluciones, cierre/ajustes, cambios de responsable,
proyecciones y conciliación de historia con saldos iniciales antes de integrarlo.

- B02: falta contexto transaccional RLS en consumidores; no relaja aislamiento tenant.
- B03/C01: lectura FIXED usa campo antiguo y no hay creación runtime de liquidaciones encontrada; se conservan las fórmulas y ambos ejemplos de la sección 11.
- B04: importar ANULADO como COMPLETADO es un bug; no habilita su conteo.
- C03: finalización onboarding persiste, pero draft/avance son temporales. Resolver explícitamente la promesa anterior de progreso persistido; no darla por eliminada.
- C04: resuelto por DEC-017: restar obligaciones al responsable, incluyendo las
  derivadas de cobros previstos. Ver FINANCIAL_MODEL para reglas aprobadas;
  la unificación de los consumidores runtime continúa pendiente.
- C02/C05: resolver lifecycle de Instructor/invitaciones y clasificación duplicada sin crear autoridades paralelas.

Detalles y fuentes en CURRENT_STATE, ONBOARDING, FINANCIAL_MODEL y TENANCY_AND_RBAC. Esta sincronización no implementa correcciones ni decisiones pendientes.
