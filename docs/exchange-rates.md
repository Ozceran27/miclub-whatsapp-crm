# Cotizaciones oficiales

La integración incluida usa la serie mayorista USD/ARS de la Comunicación A 3500
del BCRA (variable monetaria 5). El endpoint es público y no requiere token.

```dotenv
EXCHANGE_RATE_PROVIDER_URL=https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias
EXCHANGE_RATE_BCRA_VARIABLE_ID=5
EXCHANGE_RATE_SYNC_PAIRS=USD/ARS
EXCHANGE_RATE_TIMEOUT_MS=5000
EXCHANGE_RATE_RETRIES=3
EXCHANGE_RATE_LOOKBACK_DAYS=7
EXCHANGE_RATE_MAX_AGE_DAYS=4
EXCHANGE_RATE_PIVOT_CURRENCY=USD
EXCHANGE_RATE_SOURCE=BCRA-A3500
```

Después de ejecutar las migraciones, cargar una cotización con:

```bash
npm run sync:exchange-rates -w @miclub/api
# Fecha histórica opcional:
npm run sync:exchange-rates -w @miclub/api -- 2026-08-28
```

El job usa deliberadamente las credenciales administrativas `ADMIN_DATABASE_URL`
o `PGADMIN*`, no las credenciales runtime de la API.

Verificarla con `select * from miclub.exchange_rates order by rate_date desc;` y
revisar fallos con `select * from miclub.exchange_rate_sync_state;`. Programar el
primer comando una vez por día hábil; el dashboard nunca llama al BCRA.

La fuente A 3500 sólo cubre USD/ARS. BRL y EUR continúan admitidos por el dominio,
pero para valuarlos es necesario incorporar otra fuente oficial que publique
BRL/USD y EUR/USD (o sus pares inversos) y persistir esas cotizaciones. No se debe
agregar esos pares a `EXCHANGE_RATE_SYNC_PAIRS` mientras se use el proveedor A 3500.
