-- Tesorería: conciliación manual de la base real. Sólo SELECT; no altera datos.
-- Ejecutar primero las dos verificaciones siguientes. Continuar únicamente si
-- transaction_read_only = on y el usuario corresponde al rol de auditoría.
SELECT current_user;
SHOW transaction_read_only;

-- Parámetros DBeaver: :club_id (UUID), :from_at y :to_at (timestamptz).
-- Intervalo semiabierto [from_at, to_at). Use límites del calendario del club.
-- Preconditions: club existente, tablas miclub.movements, clubs, exchange_rates,
-- movement_categories y category_catalog disponibles. No requiere permisos de escritura.
SELECT id, name, timezone, base_currency_code
FROM miclub.clubs WHERE id = :club_id::uuid;

-- 1. Estado, origen y año local. Permite localizar finance_circuit y movimientos
-- retroactivos sin depender de los nombres de las antiguas hojas.
SELECT extract(year FROM m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::int AS year,
       m.source, m.operational_status, m.movement_type, m.currency_code,
       count(*) AS movements, sum(m.amount) AS nominal_amount
FROM miclub.movements m JOIN miclub.clubs c ON c.id = m.club_id
WHERE m.club_id = :club_id::uuid
GROUP BY 1, 2, 3, 4, 5 ORDER BY 1 DESC, 2, 3, 4, 5;

-- 2. Movimientos del período para cotejo por ID con Administración y API.
SELECT m.id, m.movement_date, m.source, m.operational_status,
       m.movement_type, m.currency_code, m.amount, m.account_id,
       m.sector_id, m.activity_id, m.category_id,
       cc.code AS category_code, cc.classification
FROM miclub.movements m
LEFT JOIN miclub.movement_categories mc ON mc.id = m.category_id AND mc.club_id = m.club_id
LEFT JOIN miclub.category_catalog cc ON cc.id = mc.catalog_id
WHERE m.club_id = :club_id::uuid
  AND m.movement_date >= :from_at::timestamptz
  AND m.movement_date < :to_at::timestamptz
ORDER BY m.movement_date, m.id;

-- 3. Cotizaciones oficiales admisibles al día local de cada movimiento.
-- Un resultado sin direct_rate y sin ambas cotizaciones de pivote USD debe
-- aparecer como incompleto en Tesorería, nunca como importe cero.
SELECT m.id, m.currency_code, c.base_currency_code,
       (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date AS movement_day,
       direct_rate.rate_date AS direct_rate_date, direct_rate.rate AS direct_rate,
       source_usd.rate_date AS source_usd_date, source_usd.rate AS source_usd_rate,
       usd_target.rate_date AS usd_target_date, usd_target.rate AS usd_target_rate
FROM miclub.movements m JOIN miclub.clubs c ON c.id = m.club_id
LEFT JOIN LATERAL (
  SELECT er.rate_date, er.rate FROM miclub.exchange_rates er
  WHERE er.rate_type = 'official' AND er.rate_date BETWEEN
    (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date - 4
    AND (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date
    AND ((er.base_currency_code = m.currency_code AND er.quote_currency_code = c.base_currency_code)
      OR (er.base_currency_code = c.base_currency_code AND er.quote_currency_code = m.currency_code))
  ORDER BY er.rate_date DESC, er.fetched_at DESC LIMIT 1
) direct_rate ON true
LEFT JOIN LATERAL (
  SELECT er.rate_date, er.rate FROM miclub.exchange_rates er
  WHERE er.rate_type = 'official' AND er.rate_date BETWEEN
    (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date - 4
    AND (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date
    AND ((er.base_currency_code = m.currency_code AND er.quote_currency_code = 'USD')
      OR (er.base_currency_code = 'USD' AND er.quote_currency_code = m.currency_code))
  ORDER BY er.rate_date DESC, er.fetched_at DESC LIMIT 1
) source_usd ON m.currency_code <> 'USD' AND c.base_currency_code <> 'USD'
LEFT JOIN LATERAL (
  SELECT er.rate_date, er.rate FROM miclub.exchange_rates er
  WHERE er.rate_type = 'official' AND er.rate_date BETWEEN
    (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date - 4
    AND (m.movement_date AT TIME ZONE coalesce(nullif(trim(c.timezone), ''), 'America/Argentina/Buenos_Aires'))::date
    AND ((er.base_currency_code = 'USD' AND er.quote_currency_code = c.base_currency_code)
      OR (er.base_currency_code = c.base_currency_code AND er.quote_currency_code = 'USD'))
  ORDER BY er.rate_date DESC, er.fetched_at DESC LIMIT 1
) usd_target ON source_usd.rate IS NOT NULL
WHERE m.club_id = :club_id::uuid AND m.operational_status IN ('COMPLETADO','PENDIENTE')
  AND m.movement_type IN ('INGRESOS','EGRESOS')
  AND m.movement_date >= :from_at::timestamptz AND m.movement_date < :to_at::timestamptz
  AND m.currency_code IS DISTINCT FROM c.base_currency_code
ORDER BY movement_day, m.id;

-- Postvalidación manual: cotejar IDs y estados del resultado 2 con
-- /api/economy/recent-movements, /pending y /monthly-evolution?year=YYYY.
-- Cotejar liquidez/proyección con /api/finance/circuit; revisar el corte de
-- arranque aprobado antes de imputar movimientos históricos al saldo actual.
-- Rollback: no corresponde; el script no escribe datos.
