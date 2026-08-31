BEGIN;

CREATE TABLE miclub.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency_code text NOT NULL REFERENCES miclub.currencies(code),
  quote_currency_code text NOT NULL REFERENCES miclub.currencies(code),
  rate numeric(30, 12) NOT NULL CHECK (rate > 0),
  rate_date date NOT NULL,
  rate_type text NOT NULL,
  source text NOT NULL,
  source_reference text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rates_distinct_currencies CHECK (base_currency_code <> quote_currency_code),
  CONSTRAINT exchange_rates_natural_key UNIQUE
    (base_currency_code, quote_currency_code, rate_date, rate_type, source)
);

CREATE INDEX exchange_rates_lookup_idx ON miclub.exchange_rates
  (base_currency_code, quote_currency_code, rate_type, rate_date DESC);

CREATE TABLE miclub.exchange_rate_sync_state (
  source text PRIMARY KEY,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Closed calculations reference the exact immutable quote instead of re-resolving it.
CREATE TABLE miclub.exchange_rate_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_rate_id uuid NOT NULL REFERENCES miclub.exchange_rates(id) ON DELETE RESTRICT,
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE RESTRICT,
  usage_type text NOT NULL,
  usage_reference text NOT NULL,
  amount numeric(30, 8) NOT NULL,
  converted_amount numeric(30, 8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, usage_type, usage_reference)
);

CREATE OR REPLACE FUNCTION miclub.reject_exchange_rate_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'exchange_rates are immutable; insert a new dated quote';
END $$;
CREATE TRIGGER exchange_rates_immutable
  BEFORE UPDATE OR DELETE ON miclub.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION miclub.reject_exchange_rate_mutation();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'miclub_runtime') THEN
    GRANT SELECT ON miclub.exchange_rates TO miclub_runtime;
  END IF;
END $$;

COMMIT;
