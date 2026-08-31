# Cotizaciones oficiales

La integración incluida usa la serie mayorista USD/ARS de la Comunicación A 3500
del BCRA (variable monetaria 5). El endpoint es público y no requiere token.

```dotenv
EXCHANGE_RATE_PROVIDER_URL=https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias
EXCHANGE_RATE_BCRA_VARIABLE_ID=5
EXCHANGE_RATE_SYNC_PAIRS=USD/ARS
EXCHANGE_RATE_TIMEOUT_MS=5000
EXCHANGE_RATE_RETRIES=3
EXCHANGE_RATE_LOOKBACK_DAYS=7
EXCHANGE_RATE_MAX_AGE_DAYS=4
EXCHANGE_RATE_PIVOT_CURRENCY=USD
EXCHANGE_RATE_SOURCE=BCRA-A3500
```

La versión `v3.0` fue retirada por el BCRA y responde HTTP 410. Debe usarse
`v4.0`; el adaptador también reemplaza automáticamente una URL `v3.0` heredada.
La consulta v4 usa únicamente `Desde`, `Hasta`, `Limit` y `Offset`; no debe
agregarse `Order`, porque v4 rechaza ese parámetro con HTTP 400. El adaptador
ordena las observaciones recibidas por fecha antes de elegir la última admisible.
El parser admite tanto la lista plana histórica como la respuesta v4 agrupada por
variable y normaliza fechas ISO con hora. Si la serie está vacía, el error informa
la ventana consultada, las claves superiores y cuántas observaciones se encontraron.

Después de ejecutar las migraciones, cargar una cotización con:

```bash
npm run sync:exchange-rates -w @miclub/api
# Fecha histórica opcional:
npm run sync:exchange-rates -w @miclub/api -- 2026-08-28
```

El job usa deliberadamente las credenciales administrativas `ADMIN_DATABASE_URL`
o `PGADMIN*`, no las credenciales runtime de la API. El archivo se busca siempre
en `.env` de la raíz del repositorio, aunque npm inicie el proceso desde `apps/api`.
Para una instalación manual donde el mismo login es propietario puede apuntarse
`ADMIN_DATABASE_URL` a esa conexión; el login debe tener `INSERT` y `UPDATE` sobre
las tablas de cotizaciones y estado de sincronización.

Verificarla con `select * from miclub.exchange_rates order by rate_date desc;` y
revisar fallos con `select * from miclub.exchange_rate_sync_state;`. Programar el
primer comando una vez por día hábil; el dashboard nunca llama al BCRA.

La fuente A 3500 sólo cubre USD/ARS. BRL y EUR continúan admitidos por el dominio,
pero para valuarlos es necesario incorporar otra fuente oficial que publique
BRL/USD y EUR/USD (o sus pares inversos) y persistir esas cotizaciones. No se debe
agregar esos pares a `EXCHANGE_RATE_SYNC_PAIRS` mientras se use el proveedor A 3500.

## Instalaciones existentes administradas manualmente

`db:migrate` es el instalador incremental para bases cuyo historial está registrado
en `public.miclub_schema_migrations`. No debe ejecutarse para intentar reconstruir
el historial sobre un esquema `miclub` existente que fue actualizado manualmente.
Si las tres tablas de cotizaciones, sus restricciones, el trigger, el índice y el
grant ya se aplicaron con el script DBeaver, no hay otra migración que ejecutar para
esta funcionalidad. La adopción posterior del ledger requiere comparar el esquema
real con cada versión y aprobación DBA; no se resuelve insertando todas las filas.
