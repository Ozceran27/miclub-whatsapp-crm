BEGIN;
ALTER TABLE miclub.movements
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES miclub.activities(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE INDEX IF NOT EXISTS movements_activity_id_idx ON miclub.movements(activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS movements_club_idempotency_key_uidx
  ON miclub.movements(club_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
COMMIT;
