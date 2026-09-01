BEGIN;

-- A cross quote has no single exchange_rates row. Keep the legacy column for
-- one-leg usages and persist every immutable leg in this ordered relation.
ALTER TABLE miclub.exchange_rate_usages ALTER COLUMN exchange_rate_id DROP NOT NULL;

CREATE TABLE miclub.exchange_rate_usage_components (
  exchange_rate_usage_id uuid NOT NULL REFERENCES miclub.exchange_rate_usages(id) ON DELETE RESTRICT,
  exchange_rate_id uuid NOT NULL REFERENCES miclub.exchange_rates(id) ON DELETE RESTRICT,
  component_order smallint NOT NULL CHECK (component_order > 0),
  PRIMARY KEY (exchange_rate_usage_id, component_order),
  UNIQUE (exchange_rate_usage_id, exchange_rate_id)
);

INSERT INTO miclub.exchange_rate_usage_components(exchange_rate_usage_id,exchange_rate_id,component_order)
SELECT id,exchange_rate_id,1 FROM miclub.exchange_rate_usages WHERE exchange_rate_id IS NOT NULL;

CREATE OR REPLACE FUNCTION miclub.record_exchange_rate_usage(
  p_club_id uuid,p_usage_type text,p_usage_reference text,p_account_valuations jsonb
) RETURNS integer LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  valuation jsonb;
  usage_id uuid;
  component_ids jsonb;
  inserted_count integer := 0;
BEGIN
  FOR valuation IN SELECT value FROM jsonb_array_elements(p_account_valuations) LOOP
    component_ids := coalesce(valuation->'exchangeRateIds',
      CASE WHEN valuation->>'exchangeRateId' IS NOT NULL
        THEN jsonb_build_array(valuation->>'exchangeRateId') ELSE '[]'::jsonb END);
    IF jsonb_array_length(component_ids) > 0 AND valuation->>'convertedBalance' IS NOT NULL THEN
      INSERT INTO miclub.exchange_rate_usages(exchange_rate_id,club_id,usage_type,usage_reference,amount,converted_amount)
      VALUES(CASE WHEN jsonb_array_length(component_ids)=1 THEN (component_ids->>0)::uuid END,
        p_club_id,p_usage_type,p_usage_reference||':'||(valuation->>'accountId'),
        (valuation->>'nominalBalance')::numeric,(valuation->>'convertedBalance')::numeric)
      ON CONFLICT (club_id,usage_type,usage_reference) DO NOTHING RETURNING id INTO usage_id;
      IF usage_id IS NOT NULL THEN
        INSERT INTO miclub.exchange_rate_usage_components(exchange_rate_usage_id,exchange_rate_id,component_order)
        SELECT usage_id,value::uuid,ordinality::smallint
        FROM jsonb_array_elements_text(component_ids) WITH ORDINALITY;
        inserted_count := inserted_count + 1;
      END IF;
    END IF;
    usage_id := NULL;
  END LOOP;
  RETURN inserted_count;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='miclub_runtime') THEN
    GRANT INSERT ON miclub.exchange_rate_usage_components TO miclub_runtime;
    GRANT EXECUTE ON FUNCTION miclub.record_exchange_rate_usage(uuid,text,text,jsonb) TO miclub_runtime;
  END IF;
END $$;

COMMIT;
