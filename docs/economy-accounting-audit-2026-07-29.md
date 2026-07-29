# Auditoría contable de Economía Club — 2026-07-29

## Fuente de verdad y fórmulas

Inicio tomaba `liquidity`, `cash`, `bank` y `dollars` del último corte de
`operational_balances` y calculaba el saldo proyectado como **liquidez + cuotas a
cobrar + saldo a liquidar (con signo) + pendientes**. Economía tomaba ambos
valores de `v_dashboard_basic`; esa vista calculaba liquidez solamente como
INGRESOS COMPLETADOS menos EGRESOS COMPLETADOS. Por eso mostraba utilidad
acumulada en lugar de caja y además duplicaba la fórmula.

La consulta autoritativa quedó en `getClubFinanceSummary`: usa el último corte
PostgreSQL de saldos operativos (que incorpora capital inicial, aportes, ajustes,
traspasos caja/banco y la valuación histórica de dólares) y sólo usa la vista
para cuotas, liquidaciones y pendientes. No se modificó la importación ni datos.
CAPITAL queda fuera de ingresos, egresos y utilidad; sí está incorporado en el
corte de liquidez.

## Reconciliación mensual de ingresos

La comparación se hizo movimiento por movimiento contra la fila histórica
guardada en `source_payload.row`, aplicando exactamente tipo `INGRESOS`, estado
`COMPLETADO` y el intervalo semiabierto del mes en Argentina.

| Mes 2026 | Planilla | PostgreSQL | Diferencia |
|---|---:|---:|---:|
| Marzo | 1.083.501 | 1.083.501 | 0 |
| Abril | 4.289.262 | 4.374.262 | 85.000 |
| Mayo | 4.296.109 | 4.381.109 | 85.000 |
| Junio | 5.622.517 | 5.818.517 | 196.000 |
| Julio (corte del dump) | 5.429.019 | 5.459.019 | 30.000 |

Las diferencias informadas se explican íntegramente por filas cuyo estado de la
planilla es ANULADO pero cuyo `operational_status` persistido es COMPLETADO:

| Mes | ID | Concepto | Importe |
|---|---|---|---:|
| Abril | I-0170 | Pago de cuota de Maria Belen Bistoletti | 25.000 |
| Abril | I-0402 | PAGO POR USO - Contemporáneo y Samba | 60.000 |
| Mayo | I-0425 | Pago de cuota de María Carla Nuñez | 25.000 |
| Mayo | I-0436 | Pago de cuota de Martina Fernandez | 20.000 |
| Mayo | I-0433 | Seña Tattoo - Nahiara brazo | 40.000 |
| Junio | I-0597 | Conciliación de caja y banco | 146.000 |
| Junio | I-0637 | Cuota Karate - Diamela Tavares | 20.000 |
| Junio | I-0636 | Cuota Jiu Jitsu - Diamela Tavares | 30.000 |
| Julio | I-0858 | Cuota Complemento - Celia Rita Montenegro | 30.000 |

No hay diferencias de importe, fecha, tipo o categoría responsables de esos
totales. La diferencia está en el estado histórico persistido, no en la suma
mensual. No se corrigió “a ciegas”: PostgreSQL continúa siendo autoritativo y el
script `audit:economy-movements -- <club_id>` entrega todas las columnas de ambos
lados para conciliación y eventual corrección contable aprobada.
