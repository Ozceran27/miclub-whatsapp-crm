# Saldos Operativos — regla autoritativa

**Vigencia:** 2026-07-11.

## Contrato de dashboard

La API debe exponer una única metodología para:

```json
{
  "liquidity": 1000,
  "feesToCollect": 180,
  "settlementBalance": -100,
  "pendingBalance": 300,
  "projectedBalance": 1380
}
```

En el contrato histórico de miClub estos campos se publican como `liquidity`, `cuotasACobrar`, `settlementBalance`, `pendingNetBalance` y `projectedBalance`. `saldosAPagar` queda como alias temporal deprecado de `settlementBalance` y debe contener el mismo valor negativo, no otra cifra.

## Cuotas a Cobrar

Representa el monto que realmente corresponde cobrar a miClub por cuotas adeudadas. La fuente autoritativa es PostgreSQL (`enrollments`, `v_enrollment_operational_status`, `activities`, `sectors`), consolidada en backend.

Filtros:

- incluir solo inscripciones con estado efectivo `ADEUDANDO`;
- excluir cuotas `<= 0`;
- excluir abandonados, cancelados, al día, nuevos inscriptos y duplicados;
- usar la cuota de la inscripción, no deuda bruta con otros conceptos.

Comisiones:

- FITNESS: cuota × 50%;
- SALÓN: cuota × 0%;
- AULA: cuota × comisión configurada en la actividad (`club_commission_percent`), aceptando `40` o `0.40` como 40%;
- otros sectores: 0 y advertencia técnica.

Ejemplo: FITNESS $20.000 → $10.000; SALÓN $20.000 → $0; AULA 40% $20.000 → $8.000. Total: $18.000.

## Saldos a Liquidar

Representa obligaciones del club con responsables o sectores. La fuente autoritativa son los últimos snapshots importados en PostgreSQL desde X3 para `fitness.settlement_balance`, `salon.settlement_balance`, `aula.settlement_balance` y `local1.settlement_balance`, complementados por `v_sector_settlement_balances` cuando corresponde.

Convención:

- internamente se normaliza cada obligación como positiva para sumar;
- el valor expuesto al dashboard (`settlementBalance`) es negativo;
- si un sector falta, se considera cero;
- no se incluyen otros sectores sin regla explícita;
- no se duplica una misma métrica.

Ejemplo: LOCAL 1 $20 + FITNESS $40 + SALÓN $30 + AULA $10 = $100 bruto; se expone `-100`.

## Saldos Pendientes

Representa exclusivamente el neto de movimientos económicos pendientes de ADMINISTRACIÓN.

Fórmula:

`INGRESOS pendientes - EGRESOS pendientes`

Reglas:

- pendiente se determina con una normalización común: `operational_status = PENDIENTE` o `financial_status = pendiente`;
- la fuente debe ser ADMINISTRACIÓN;
- se excluyen completados, cancelados/anulados, duplicados y movimientos que no sean `INGRESOS` o `EGRESOS`;
- `CAPITAL` no se incluye automáticamente;
- no se agregan cuotas futuras, cuentas a cobrar, saldos a liquidar ni snapshots.

## Saldo Proyectado

Única fórmula vigente:

`Saldo Proyectado = Liquidez + Cuotas a Cobrar + Saldos a Liquidar + Saldos Pendientes`

`Saldos a Liquidar` ya llega negativo; por lo tanto se suma y nunca se vuelve a restar.

Ejemplo: `$1.000 + $180 - $100 + $300 = $1.380`.

## Diferencias con fórmulas anteriores

- Se reemplaza el nombre visible “Saldos a Pagar” por “Saldos a Liquidar”.
- La tarjeta muestra: Cuotas a Cobrar, Saldos a Liquidar, Saldos Pendientes, Saldo Proyectado.
- `pendingNetBalance` ya no incluye cuotas futuras del mes ni cuentas a cobrar.
- `projectedBalance` ya no usa `- saldosAPagar`; suma `settlementBalance` porque el valor ya es negativo.
- Los fallbacks no deben producir cifras diferentes silenciosamente; si hay diferencias se registran como advertencias.
