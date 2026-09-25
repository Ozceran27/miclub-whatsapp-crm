# Financial Model

## Lectura de saldos en Trabajadores — 2026-09-23

La columna «Saldo a Liquidar» agrega por `person_id` y moneda los saldos firmados que devuelve el circuito financiero vigente. Incluye liquidaciones de actividades de todas las vigencias, obligaciones de remuneración fija con vencimiento hasta hoy y obligaciones iniciales `EMPLOYEE` aprobadas. Si una remuneración vencida todavía no tiene obligación materializada, la lectura usa `compensationDueDates` y la muestra como devengado pendiente de revisión, sin persistir ni habilitar pagos. Tras un arranque aprobado, excluye remuneraciones anteriores o iguales al corte para evitar duplicarlas con la obligación inicial. El propio circuito aplica pagos, ajustes y compensaciones explícitos; la tabla no recalcula esas reglas. Una línea `DRAFT` o `REQUIRES_REVIEW` contribuye al devengado visible con aviso de revisión, pero sólo los importes aprobados pueden procesarse para pago. Un diagnóstico del circuito vuelve incompleto el saldo de los receptores afectados. No se convierten monedas en esta columna.

Los tableros usan el circuito para los saldos sectoriales de actividades. La vista `v_activity_settlement_sector_balances`, que usa el campo histórico `monthly_fixed_fee`, queda fuera del runtime de tableros y sólo se conserva para auditoría de divergencias. Los totales sectoriales con varias monedas se marcan incompletos hasta que exista una valoración homogénea; no se suman importes nominales heterogéneos.

## Presentación de saldos operativos (2026-09-21)

El circuito devuelve totales separados por moneda: `activityToPay` (saldo positivo
de actividades), `activityToCollect` (valor absoluto de saldos negativos),
`fixedCompensationToPay` (remuneraciones aprobadas) y `totalToPay`. No se convierten
ni suman monedas sin cotización. La remuneración fija personal sigue siendo una
obligación independiente del fee FIXED contractual de la actividad.

## Extensión administrativa — 2026-09-19

Esta sección sustituye las menciones históricas inferiores a prorrateo o a una
integración futura. Los términos FIXED DAILY/WEEKLY/MONTHLY/YEARLY generan
vencimientos completos y asignados a un único mes. La frecuencia semanal se ancla
en `effective_from`, la mensual vence al cierre calendario y la anual en el
aniversario. No hay prorrateo.

`employee_compensation_terms` conserva remuneraciones históricas y
`employee_compensation_obligations` materializa borradores idempotentes. Sólo los
aprobados participan del pago. El neto por persona/moneda suma liquidaciones de
actividad y remuneraciones; primero compensa deudas FIFO sin caja y luego crea un
movimiento por cada porción pagada/cobrada bajo un `payout_group_id` anulable.
Los ajustes no sobrescriben el cálculo base y fuerzan `REQUIRES_REVIEW`.

Las correcciones de apertura llaman al mecanismo canónico
`replace_opening_balances`, que revierte el lote previo y crea uno nuevo. La
migración y el script DBeaver del 19/09 deben aplicarse antes de usar esta extensión.

## Integración operativa — 2026-09-11

`financialCircuitService` aplica el calculador mensual al runtime PostgreSQL;
`financialMovementService` coordina movimiento, pago, aplicaciones y devolución;
`financialStartupService` concilia arranque y obligaciones iniciales. El frontend
consume `/api/finance/circuit` y no calcula repartos. Aprobaciones conservan
snapshot y revisión; corregir un ingreso no borra el pago. Las devoluciones nuevas
registran las aplicaciones canceladas para permitir su corrección sin duplicación.

Las proyecciones excluyen historia y cuotas anteriores al corte ya conciliado,
exceptuando las obligaciones iniciales explícitas. Los saldos iniciales de
empleados/proveedores pendientes se descuentan de la proyección. Los saldos
importados DRAFT no entran al circuito hasta aprobación. La actualización de
estructura faltante se comunica como error explícito, nunca como saldo cero.

Instalación y límites de verificación: CURRENT_STATE y
[guía manual](../dbeaver/GUIA-CIRCUITO-FINANCIERO.md).

## Circuito aprobado — DEC-017

Estas reglas prevalecen sobre las descripciones del runtime histórico inferiores.
Su aprobación no certifica implementación ni despliegue.

- Primera versión mensual, por calendario y zona horaria del club. Frecuencias
  distintas se conservan y requieren revisión explícita antes de liquidar.
- El club recibe todos los cobros. Se atribuyen al responsable y término vigentes
  el día del cobro, incluyendo cuotas atrasadas y señas. VARIABLE reparte el bruto
  sin restar automáticamente impuestos/gastos.
- FIXED admite prorrateo por días calendario de vigencia o mes completo, elegido
  expresamente. Un cambio de responsable con mes completo exige distribuir un
  único fijo mensual. Cambios ordinarios del importe rigen el primer día del mes.
- Saldos por persona/club, desglosados por actividad y moneda. La deuda permanece
  con el receptor; se compensa entre sus actividades, primero la más antigua,
  sin caja. Entre monedas se exige conversión explícita y cotización registrada.
- Borrador, aprobado y requiere revisión son estados de revisión. Pendiente,
  parcial y saldado se derivan de importes. Aprobar, pagar y cerrar son distintos.
  Se permiten pagos parciales/a cuenta revisados, hasta el neto disponible.
- Correcciones históricas autorizadas conservan anterior, actor, fecha y motivo;
  UUID, tenant y origen son inmutables. Recalculan los períodos afectados sin
  borrar pagos. Invalidan revisión/conciliación conservando su evidencia anterior.
- Devolución real: egreso vinculado al cobro, parcial y limitado al remanente.
  VARIABLE revierte reparto y receptor originales; FIXED reduce el derecho por
  todo lo devuelto sin modificar el fijo. Cancela la obligación proporcional del
  alumno; no reabre deuda ni afecta el remanente no devuelto.
- Abandono exige conservar/perdonar deuda y motivo; detiene cuotas futuras y
  excluye la inscripción de Estimación Futura.
- Saldo proyectado = liquidez + cobros pendientes − pagos pendientes −
  liquidaciones pendientes y previstas. Cobro previsto 10000 al 50% aporta 5000.
- Estimación Futura = proyectado + participación del club en cuotas impagas aún
  no incluidas. FIXED agrega cero; su deuda se muestra separada. Deduplicación
  por obligación explícita, nunca por importe/fecha. Mostrar componentes, fecha,
  supuestos y total incompleto si falta cotización. Sin fecha de cobro prevista,
  usar acuerdo vigente a la fecha de cálculo y declarar ese supuesto.
- Arranque persistente: reconstrucción desde saldo previo y movimientos completos,
  o corte con saldos aprobados al cierre y operaciones posteriores. Obligaciones
  iniciales de alumnos, responsables, empleados/proveedores no simulan caja.
  Historia anterior al corte es consultable; corregirla exige conciliación y
  ajuste explícito, no altera automáticamente el saldo inicial.
- Importación versionada con IDs de origen, revisión de coincidencias y comparación
  esperado/importado/diferencia antes de aprobar. No duplicar capital, cuotas,
  pagos o saldos entre lotes. SQL real sólo manual por DBeaver.

Permisos separados: revisar liquidaciones, pagarlas, corregir historia y conciliar.
Director los recibe por defecto y puede delegarlos. Mutaciones requieren versión,
idempotencia, transacción y comprobación de referencias dentro del tenant.

## Fuente y estados

PostgreSQL es autoridad. Tipos técnicos INGRESOS/EGRESOS/CAPITAL; operational_status gobierna agregados ordinarios con COMPLETADO, no financial_status (pagado, pendiente, etc.). PENDIENTE tiene agregados específicos. Anulados no deben volver a participar.

Categorías: shared movementCategoryCatalog y DB category_catalog/aliases con asociaciones movement_categories. Toda categoría activa se puede usar en INGRESOS y EGRESOS; el tipo pertenece al movimiento. La dirección almacenada en categorías queda nula mediante 202609250001 sin modificar IDs, clasificación ni movimientos históricos. CMV es NON_OPERATIONAL desde 202609050003. El procesamiento de liquidaciones, remuneraciones y cobros de deuda restringe la elección a OPERATIONAL o DEUDAS; los cobros de deuda se excluyen de la recaudación y rentabilidad de actividad.

El pago requiere una vista previa backend del saldo neto por persona y moneda, compensaciones y aplicaciones FIFO. La confirmación valida un hash de la versión y rechaza saldos cambiados; la operación permanece idempotente bajo el lock financiero del tenant. Una versión recalculada o ajustada invalida aprobación/cierre vigente y conserva la historia de revisión anterior. Anular un grupo revierte sus aplicaciones a obligaciones iniciales. Conciliar dos veces el mismo movimiento se rechaza.

## Liquidez y saldos iniciales

financial_accounts, opening_balance_batches y opening_balance_movements relacionan saldos iniciales con movimientos auditables de capital y conciliación. replace_opening_balances usa clave idempotente y moneda operativa. 202609050002 corrige financial_status a pagado sin ampliar el enum.

Valoración multimoneda: currencies, exchange_rates, sync_state, usages/components y función value_club_liquidity. Conserva fuentes/fechas/componentes de cotización y señala faltantes; no inventar una conversión cuando faltan datos. Monedas operativas ARS/USD/BRL/EUR.

## Reglas de liquidación conservadas

Definiciones de dirección 2026-09-09: todos los cobros los recibe el club y se
atribuyen al mes de cobro, incluidas cuotas atrasadas y señas. Saldo negativo FIXED
representa deuda del responsable: 60000 − 85000 = -25000. El calculador conserva
el signo y tiene regresión; el arrastre/cobro operativo se integra en la próxima
etapa de cierre y ajustes. No se certifica esa integración por este test.

VARIABLE: club_share_percentage pertenece al club; responsable recibe 100 menos ese porcentaje.

completed operational income × responsible share − settlements paid.

Ejemplo obligatorio: 100000 × 60% − 20000 = 40000.

FIXED mensual: completed operational income − fixed monthly club fee − settlements paid.

Ejemplo obligatorio: 500000 − 150000 − 30000 = 320000.

No inferir pagos al responsable de cualquier egreso. PAYMENT/ADVANCE son movimientos indivisibles por allocation activa/tipo; dividir operación real exige movimientos separados. Ver docs/domains/business-rules/activity-settlement-allocations.md.

Los términos históricos respetan effective_from/effective_to; no sustituirlos por condiciones actuales. El modelo moderno agrega fixed_club_fee, fixed_fee_frequency y currency_code; frecuencias DAILY/WEEKLY/MONTHLY/YEARLY.

## Autoridades y divergencia runtime

- postgresDashboard/implementation.ts consume v_activity_settlement_sector_balances.
- v_activity_settlement_balances parte de activity_settlements COMPLETADO no anulados, relacionados con término/período y allocations.
- La vista suma ingresos completados de la actividad por fecha; no agrega un filtro de clasificación de categoría.
- **B03 histórico:** la vista conserva `monthly_fixed_fee` y no es fuente de saldos en los tableros actuales. `readOnlyRepository` ya lee `fixed_club_fee`, frecuencia y moneda. Un consumidor externo de la vista debe tratarla como legacy.
- **C01 histórico:** `financialCircuitService.loadCircuit` materializa `activity_settlements` desde movimientos y términos. La paridad con datos de la base real queda pendiente de auditoría de solo lectura.
- El cálculo TS usa calendario Buenos Aires; FIXED mensual exige meses completos. No extender implícitamente esta política a reglas no resueltas.

Estos son bugs/brechas, no modificaciones de las fórmulas anteriores. Falta definir/materializar el ciclo de liquidación y comprobar paridad SQL con los ejemplos.

## Saldo proyectado y precisión

operationalBalancesCalculator.ts implementa liquidity + feesToCollect + settlementBalance + pendingBalance.

**C04:** settlementBalance positivo representa deuda al responsable; aclarar significado/signo de “proyectado” antes de cambiar fórmula. No afirmar que esa suma representa disponibilidad neta del club.

Hay cálculos JS con Number/redondeo y SQL numeric; no prometer aritmética decimal uniforme. Parte de las fechas usa Buenos Aires y parte timezone del club; ampliar timezone requiere revisar ambos caminos.

## Otros riesgos

B04 corregido en workbook.ts: ANULADO se conserva y estados desconocidos se rechazan.

Fuentes: movementPredicates.ts, operationalBalancesCalculator.ts, activitySettlementService.ts, postgresDashboard/implementation.ts; migrations 202608210002, 202608270003, 202608280003, 202608310001, 202609010002/3 y 202609050002/3.
