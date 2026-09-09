# Financial Model

## Fuente y estados

PostgreSQL es autoridad. Tipos técnicos INGRESOS/EGRESOS/CAPITAL; operational_status gobierna agregados ordinarios con COMPLETADO, no financial_status (pagado, pendiente, etc.). PENDIENTE tiene agregados específicos. Anulados no deben volver a participar.

Categorías: shared movementCategoryCatalog y DB category_catalog/aliases con asociaciones movement_categories. CMV es NON_OPERATIONAL desde 202609050003. C05: economyDomain conserva listas fallback divergentes; no constituyen otra regla aceptada.

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

No inferir pagos al responsable de cualquier egreso. PAYMENT/ADVANCE son movimientos indivisibles por allocation activa/tipo; dividir operación real exige movimientos separados. Ver docs/business-rules/activity-settlement-allocations.md.

Los términos históricos respetan effective_from/effective_to; no sustituirlos por condiciones actuales. El modelo moderno agrega fixed_club_fee, fixed_fee_frequency y currency_code; frecuencias DAILY/WEEKLY/MONTHLY/YEARLY.

## Autoridades y divergencia runtime

- postgresDashboard/implementation.ts consume v_activity_settlement_sector_balances.
- v_activity_settlement_balances parte de activity_settlements COMPLETADO no anulados, relacionados con término/período y allocations.
- La vista suma ingresos completados de la actividad por fecha; no agrega un filtro de clasificación de categoría.
- **B03:** vista y readOnlyRepository aún leen monthly_fixed_fee; altas modernas escriben fixed_club_fee/frecuencia/moneda. FIXED nuevo puede devolver NULL y desaparecer del agregado; frecuencias y monedas no están conciliadas en esa vista.
- **C01:** no se encontró creación runtime de activity_settlements. activitySettlementService.ts calcula en TypeScript, pero sólo se encontró consumo en tests; no certifica la vista.
- El cálculo TS usa calendario Buenos Aires; FIXED mensual exige meses completos. No extender implícitamente esta política a reglas no resueltas.

Estos son bugs/brechas, no modificaciones de las fórmulas anteriores. Falta definir/materializar el ciclo de liquidación y comprobar paridad SQL con los ejemplos.

## Saldo proyectado y precisión

operationalBalancesCalculator.ts implementa liquidity + feesToCollect + settlementBalance + pendingBalance.

**C04:** settlementBalance positivo representa deuda al responsable; aclarar significado/signo de “proyectado” antes de cambiar fórmula. No afirmar que esa suma representa disponibilidad neta del club.

Hay cálculos JS con Number/redondeo y SQL numeric; no prometer aritmética decimal uniforme. Parte de las fechas usa Buenos Aires y parte timezone del club; ampliar timezone requiere revisar ambos caminos.

## Otros riesgos

B04 corregido en workbook.ts: ANULADO se conserva y estados desconocidos se rechazan.

Fuentes: movementPredicates.ts, operationalBalancesCalculator.ts, activitySettlementService.ts, postgresDashboard/implementation.ts; migrations 202608210002, 202608270003, 202608280003, 202608310001, 202609010002/3 y 202609050002/3.
