# Financial Model

## Fuente de verdad

PostgreSQL. No Google Sheets runtime.

## Movimientos

Tipos:

- INGRESO
- EGRESO
- CAPITAL

Regla transversal: cálculos ordinarios usan `COMPLETADO`; excepciones explícitas.

## Categorías

- catálogo global `category_catalog`;
- asociación tenant `movement_categories`.

## Medios de pago

Provisioning observado: Efectivo y Transferencia.

## Liquidez

Debe derivarse del modelo financiero vigente. Opening balances deben ser auditables y no crear una segunda fuente de verdad.

## Activity Terms

Versionados mediante `effective_from`/`effective_to` según documentación vigente.

## VARIABLE

`club_share_percentage` = share del club.

`responsible_share = 100 - club_share_percentage`.

Saldo:

`completed operational income × responsible_share - paid settlements`

Caso obligatorio:

```text
Income 100000
Club 40%
Responsible 60%
Paid 20000
Expected 40000
```

## FIXED

`completed operational income - fixed club fee - paid settlements`

Caso:

```text
Income 500000
Fee 150000
Paid 30000
Expected 320000
```

## Liquidaciones

No contar cualquier egreso de actividad como liquidación.

La regla canónica de allocations indica que PAYMENT/ADVANCE es indivisible por allocation activa; para repartir una operación se crean movimientos separados.

## Saldo a Liquidar por sector

Derivado de actividades del sector y settlements, usando UUIDs.

## Saldo Proyectado

Diseño dirigido:

- Liquidez
- Cuotas a Cobrar
- Saldos a Liquidar
- Saldos Pendientes

Verificar implementación autoritativa antes de editar.

## Timezone

Evitar `toISOString()` para rangos de negocio sin conversión correcta. Respetar timezone de club.

## Precisión

Evitar floats JS en core monetario cuando comprometan exactitud.
