# Cotizaciones oficiales

El job registra cotizaciones oficiales normalizadas como **unidades de moneda
cotizada por cada USD**. El registro selecciona un adaptador independiente por
par y rechaza cualquier par desconocido antes de abrir PostgreSQL.

| Par almacenado | Fuente oficial y serie | Convención publicada | Transformación | Fecha efectiva y calendario |
|---|---|---|---|---|
| `USD/ARS` | BCRA, Comunicación A 3500, variable 5 | ARS por USD | directa | fecha de la observación; días hábiles argentinos |
| `USD/BRL` | Banco Central do Brasil, SGS serie 1 (PTAX venta) | BRL por USD | directa | fecha de la observación; días hábiles brasileños |
| `USD/EUR` | Banco Central Europeo, EXR `D.USD.EUR.SP00.A` | USD por EUR | inversa (`1 / observación`) | `TIME_PERIOD`; días hábiles TARGET/BCE |

Cada adaptador busca desde la fecha solicitada hacia atrás (siete días calendario
por defecto), elige la observación efectiva más reciente que no sea posterior y
conserva en `source_reference` la serie/clave, la fecha y, para BCE, el valor
publicado y la transformación. Cada fuente tiene URL, timeout, reintentos y ventana
propios; un HTTP no exitoso, timeout, payload inválido o ventana vacía se reintenta
y luego queda trazado en `exchange_rate_sync_state`.

```dotenv
EXCHANGE_RATE_BCRA_URL=https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias
EXCHANGE_RATE_BCRA_VARIABLE_ID=5
EXCHANGE_RATE_BCRA_TIMEOUT_MS=5000
EXCHANGE_RATE_BCRA_RETRIES=3
EXCHANGE_RATE_BCRA_LOOKBACK_DAYS=7
EXCHANGE_RATE_BCB_URL=https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados
EXCHANGE_RATE_BCB_TIMEOUT_MS=5000
EXCHANGE_RATE_BCB_RETRIES=3
EXCHANGE_RATE_BCB_LOOKBACK_DAYS=7
EXCHANGE_RATE_ECB_URL=https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A
EXCHANGE_RATE_ECB_TIMEOUT_MS=5000
EXCHANGE_RATE_ECB_RETRIES=3
EXCHANGE_RATE_ECB_LOOKBACK_DAYS=7
EXCHANGE_RATE_SYNC_PAIRS=USD/ARS,USD/BRL,USD/EUR
EXCHANGE_RATE_MAX_AGE_DAYS=4
EXCHANGE_RATE_PIVOT_CURRENCY=USD
```

Después de ejecutar las migraciones, sincronizar todos los pares configurados o
limitar temporalmente el conjunto en el ambiente:

```bash
npm run sync:exchange-rates -w @miclub/api
EXCHANGE_RATE_SYNC_PAIRS=USD/BRL npm run sync:exchange-rates -w @miclub/api
EXCHANGE_RATE_SYNC_PAIRS=USD/EUR npm run sync:exchange-rates -w @miclub/api -- 2026-08-28
```

El job lee el `.env` raíz y usa `ADMIN_DATABASE_URL` o `PGADMIN*`. Para diagnosticar:

```sql
select base_currency_code, quote_currency_code, rate, rate_date, source, source_reference
from miclub.exchange_rates order by rate_date desc, source;

select source, last_attempt_at, last_success_at, last_error, updated_at
from miclub.exchange_rate_sync_state order by source;
```

`last_attempt_at > last_success_at` junto con `last_error` identifica el último
intento fallido por fuente. Una fuente ausente nunca fue intentada; una fecha de
éxito antigua puede indicar que el scheduler no se ejecutó o que la ventana no
contenía observaciones. Compare `source_reference` con la serie oficial y amplíe
sólo la variable `*_LOOKBACK_DAYS` correspondiente si hubo un cierre prolongado.
El job debe programarse al menos una vez por día hábil; el dashboard no consulta
las fuentes externas.

## Instalaciones existentes administradas manualmente

`db:migrate` es el instalador incremental para bases cuyo historial está registrado
en `public.miclub_schema_migrations`. No debe ejecutarse para intentar reconstruir
el historial sobre un esquema `miclub` existente que fue actualizado manualmente.
Si las tres tablas de cotizaciones, sus restricciones, el trigger, el índice y el
grant ya se aplicaron con el script DBeaver, no hay otra migración que ejecutar para
esta funcionalidad. La adopción posterior del ledger requiere comparar el esquema
real con cada versión y aprobación DBA; no se resuelve insertando todas las filas.
