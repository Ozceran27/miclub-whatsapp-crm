-- Liquidaciones explícitas. Deliberadamente no convierte movimientos históricos:
-- primero se debe ejecutar docs/activity-settlements-historical-diagnostic.sql.
CREATE UNIQUE INDEX IF NOT EXISTS activity_terms_id_activity_club_unique
  ON miclub.activity_terms (id, activity_id, club_id);

CREATE TABLE IF NOT EXISTS miclub.activity_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  activity_id uuid NOT NULL,
  activity_term_id uuid NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  status text NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','COMPLETADO','CANCELADO')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_settlements_period_check CHECK (period_to >= period_from),
  CONSTRAINT activity_settlements_activity_tenant_fkey FOREIGN KEY (activity_id, club_id)
    REFERENCES miclub.activities(id, club_id),
  CONSTRAINT activity_settlements_term_tenant_fkey FOREIGN KEY (activity_term_id, activity_id, club_id)
    REFERENCES miclub.activity_terms(id, activity_id, club_id),
  UNIQUE (id, club_id),
  UNIQUE (activity_id, period_from, period_to)
);

CREATE TABLE IF NOT EXISTS miclub.activity_settlement_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id),
  settlement_id uuid NOT NULL,
  movement_id uuid REFERENCES miclub.movements(id),
  allocation_type text NOT NULL CHECK (allocation_type IN ('PAYMENT','ADVANCE','SETTLEMENT_ADJUSTMENT')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','COMPLETADO','CANCELADO')),
  occurred_at timestamptz NOT NULL,
  completed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_settlement_allocations_tenant_fkey FOREIGN KEY (settlement_id, club_id)
    REFERENCES miclub.activity_settlements(id, club_id),
  UNIQUE (settlement_id, movement_id, allocation_type)
);

CREATE INDEX IF NOT EXISTS activity_settlements_club_period_idx
  ON miclub.activity_settlements (club_id, period_from, period_to);
CREATE INDEX IF NOT EXISTS activity_settlement_allocations_settlement_idx
  ON miclub.activity_settlement_allocations (club_id, settlement_id) WHERE voided_at IS NULL;

COMMENT ON TABLE miclub.activity_settlement_allocations IS
  'Asignaciones explícitas; PAYMENT, ADVANCE y SETTLEMENT_ADJUSTMENT nunca se infieren del nombre de un movimiento.';
COMMENT ON COLUMN miclub.activity_settlements.calculated_at IS
  'Fecha obligatoria del cálculo cacheado; todo consumidor debe reconciliar el registro contra movimientos y asignaciones fuente.';
COMMENT ON COLUMN miclub.activity_settlements.status IS
  'Sólo COMPLETADO y no anulado participa de saldos ordinarios.';

CREATE OR REPLACE FUNCTION miclub.validate_activity_settlement_allocation_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.movement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM miclub.movements m WHERE m.id=NEW.movement_id AND m.club_id=NEW.club_id
  ) THEN RAISE EXCEPTION 'cross-tenant settlement movement' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS activity_settlement_allocations_validate_tenant ON miclub.activity_settlement_allocations;
CREATE TRIGGER activity_settlement_allocations_validate_tenant
BEFORE INSERT OR UPDATE OF club_id, movement_id ON miclub.activity_settlement_allocations
FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_settlement_allocation_tenant();
