BEGIN;

-- Live dashboard valuations are intentionally recalculated at their cutoff.  Four
-- calendar days is the database counterpart of EXCHANGE_RATE_MAX_AGE_DAYS=4.
CREATE OR REPLACE FUNCTION miclub.value_club_liquidity(
  p_club_id uuid,
  p_cutoff_date date DEFAULT current_date
) RETURNS TABLE (
  club_id uuid, cutoff_date date, presentation_currency_code text,
  valuation_status text, unvalued_account_count integer, missing_pairs jsonb,
  liquidity numeric, cash numeric, bank numeric, dollars numeric,
  dollars_converted numeric, account_valuations jsonb
) LANGUAGE sql STABLE AS $$
WITH accounts AS (
  SELECT a.club_id, a.account_id, a.code, a.name, a.currency_code,
         a.balance AS nominal_balance, c.base_currency_code
  FROM miclub.v_financial_account_liquidity a
  JOIN miclub.clubs c ON c.id = a.club_id
  WHERE a.club_id = p_club_id
), quoted AS (
  SELECT a.*, r.id AS exchange_rate_id, r.rate, r.rate_date, r.source,
         CASE WHEN a.currency_code=a.base_currency_code THEN 'IDENTITY'
              WHEN r.base_currency_code=a.currency_code THEN 'DIRECT'
              WHEN r.id IS NOT NULL THEN 'INVERSE' END AS direction,
         CASE WHEN a.currency_code=a.base_currency_code THEN a.nominal_balance
              WHEN r.base_currency_code=a.currency_code THEN a.nominal_balance*r.rate
              WHEN r.id IS NOT NULL THEN a.nominal_balance/r.rate END AS converted_balance
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT er.* FROM miclub.exchange_rates er
    WHERE er.rate_type='official' AND er.rate_date <= p_cutoff_date
      AND er.rate_date >= p_cutoff_date - 4
      AND ((er.base_currency_code=a.currency_code AND er.quote_currency_code=a.base_currency_code)
        OR (er.base_currency_code=a.base_currency_code AND er.quote_currency_code=a.currency_code))
    ORDER BY er.rate_date DESC, er.fetched_at DESC, er.id
    LIMIT 1
  ) r ON a.currency_code<>a.base_currency_code
), aggregate AS (
  SELECT max(base_currency_code) AS currency_code,
    count(*) FILTER (WHERE converted_balance IS NULL)::integer AS missing_count,
    jsonb_agg(DISTINCT jsonb_build_object('baseCurrencyCode',currency_code,'quoteCurrencyCode',base_currency_code))
      FILTER (WHERE converted_balance IS NULL) AS missing,
    sum(converted_balance) AS complete_liquidity,
    sum(converted_balance) FILTER (WHERE code='CASH') AS cash_value,
    sum(converted_balance) FILTER (WHERE code='BANK') AS bank_value,
    sum(nominal_balance) FILTER (WHERE currency_code='USD') AS usd_nominal,
    sum(converted_balance) FILTER (WHERE currency_code='USD') AS usd_converted,
    jsonb_agg(jsonb_build_object(
      'accountId',account_id,'code',code,'name',name,'currencyCode',currency_code,
      'nominalBalance',nominal_balance,'usdNominalBalance',CASE WHEN currency_code='USD' THEN nominal_balance END,
      'convertedBalance',converted_balance,'exchangeRateId',exchange_rate_id,'rate',rate,
      'rateDate',rate_date,'source',source,'direction',direction
    ) ORDER BY code,account_id) AS details
  FROM quoted
)
SELECT p_club_id,p_cutoff_date,currency_code,
  CASE WHEN coalesce(missing_count,0)>0 THEN 'INCOMPLETE_EXCHANGE_RATE' ELSE 'COMPLETE' END,
  coalesce(missing_count,0),coalesce(missing,'[]'::jsonb),
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(complete_liquidity,0) END,
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(cash_value,0) END,
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(bank_value,0) END,
  coalesce(usd_nominal,0),
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(usd_converted,0) END,
  coalesce(details,'[]'::jsonb)
FROM aggregate;
$$;

COMMENT ON FUNCTION miclub.value_club_liquidity(uuid,date) IS
  'Canonical live valuation. Recalculates official direct/inverse quotes at cutoff; quotes older than EXCHANGE_RATE_MAX_AGE_DAYS=4 are inadmissible.';

-- Closed/reproducible calculations call this after accepting a COMPLETE result.
CREATE OR REPLACE FUNCTION miclub.record_exchange_rate_usage(
  p_club_id uuid,p_usage_type text,p_usage_reference text,p_account_valuations jsonb
) RETURNS integer LANGUAGE sql VOLATILE AS $$
  WITH inserted AS (
    INSERT INTO miclub.exchange_rate_usages(exchange_rate_id,club_id,usage_type,usage_reference,amount,converted_amount)
    SELECT (x->>'exchangeRateId')::uuid,p_club_id,p_usage_type,
           p_usage_reference||':'||(x->>'accountId'),
           (x->>'nominalBalance')::numeric,(x->>'convertedBalance')::numeric
    FROM jsonb_array_elements(p_account_valuations) x
    WHERE x->>'exchangeRateId' IS NOT NULL AND x->>'convertedBalance' IS NOT NULL
    ON CONFLICT (club_id,usage_type,usage_reference) DO NOTHING RETURNING 1
  ) SELECT count(*)::integer FROM inserted
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='miclub_runtime') THEN
    GRANT EXECUTE ON FUNCTION miclub.value_club_liquidity(uuid,date) TO miclub_runtime;
    GRANT EXECUTE ON FUNCTION miclub.record_exchange_rate_usage(uuid,text,text,jsonb) TO miclub_runtime;
    GRANT INSERT ON miclub.exchange_rate_usages TO miclub_runtime;
  END IF;
END $$;

COMMIT;
