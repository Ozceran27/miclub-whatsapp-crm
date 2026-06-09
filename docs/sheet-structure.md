# Estructura esperada de Google Sheets

Hojas relevantes:
- ADMINISTRACIÓN
- FITNESS
- SALON
- AULA
- LOCAL 1
- CANTINA

## Inscriptos operativos

Columnas base de inscriptos usadas por el CRM en hojas operativas:
- AB: Id
- AD: Fecha
- AF: Nombre
- AI: Apellido
- AL: DNI
- AN: Teléfono
- AP: Actividad
- AR: Modalidad
- AT: Cuota
- AV: Estado
- AY: Instructor / Profesor

En el MVP se prioriza el campo **Estado = Adeudando** para cobranzas y preparación manual de WhatsApp.

## Primera integración global desde ADMINISTRACIÓN

La integración financiera global lee la hoja `ADMINISTRACIÓN` sin modificar los rangos actuales de inscriptos ni la lógica del CRM.

### Movimientos globales

- Encabezados: `ADMINISTRACIÓN!B12:AB12`
- Datos: `ADMINISTRACIÓN!B13:AB3000`
- Rango leído por la API: `ADMINISTRACIÓN!B12:AB3000`

Columnas confirmadas dentro del rango `B:AB`:
- B: Id
- C: Fecha
- E: Tipo
- H: Categoría
- K: Concepto
- P: Contra-parte
- S: Sector
- U: Monto
- X: Impuestos
- Z: Estado
- AB: Medio de pago

### Saldos líquidos / resumen financiero

La API lee `ADMINISTRACIÓN!AD12:AG14` y toma:
- `AD12`: liquidez / saldo líquido total
- `AG12`: efectivo / caja
- `AG13`: banco / cuenta corriente
- `AG14`: dólares

### Saldos pendientes

Desde `ADMINISTRACIÓN!B13:AB3000` se calculan:
- ingresos pendientes: `Tipo = INGRESOS` y `Estado = PENDIENTE`
- egresos pendientes: `Tipo = EGRESOS` y `Estado = PENDIENTE`
- saldo pendiente neto: ingresos pendientes menos egresos pendientes

Los comparadores toleran mayúsculas/minúsculas, acentos y espacios extra.

### Saldos a pagar / liquidar por sector

Se lee la celda `X3` de cada hoja sectorial:
- `FITNESS!X3`
- `SALON!X3`
- `AULA!X3`
- `LOCAL 1!X3`
- `CANTINA!X3`

La suma de esos importes alimenta `saldosAPagar`; además se devuelve el desglose por sector.

### Agrupaciones para INICIO

Desde movimientos completados de `ADMINISTRACIÓN` se calculan:
- ingresos por sector: `Tipo = INGRESOS`, `Estado = COMPLETADO`, agrupado por `Sector`, top 4 descendente
- egresos por sector: `Tipo = EGRESOS`, `Estado = COMPLETADO`, agrupado por `Sector`, top 4 descendente
- ingresos por categoría: misma lógica agrupada por `Categoría`
- egresos por categoría: misma lógica agrupada por `Categoría`

### Saldo proyectado

`saldoProyectado = liquidez + cuotasAdeudadas + saldoPendienteNeto + saldosAPagar`

`cuotasAdeudadas` reutiliza la deuda estimada calculada desde los deudores del CRM.
