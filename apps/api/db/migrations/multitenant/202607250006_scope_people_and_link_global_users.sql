-- Keep authentication identities global while making personal data club-local.
-- DNI remains available in its original display form; normalized_dni is the
-- canonical, digits-only value used for matching and uniqueness.
BEGIN;

ALTER TABLE miclub.people
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normalized_dni text GENERATED ALWAYS AS (
    nullif(regexp_replace(dni, '[^0-9]', '', 'g'), '')
  ) STORED;

-- Abort without changing the existing uniqueness rules when two legacy values
-- (for example, "12.345.678" and "12345678") collapse to the same club key.
DO $$
DECLARE
  duplicate_key text;
BEGIN
  SELECT concat_ws(' | ', club_id::text, normalized_dni)
  INTO duplicate_key
  FROM miclub.people
  WHERE normalized_dni IS NOT NULL
  GROUP BY club_id, normalized_dni
  HAVING count(*) > 1
  LIMIT 1;

  IF duplicate_key IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize people DNI; duplicate club-local key: %', duplicate_key;
  END IF;
END $$;

ALTER TABLE miclub.people DROP CONSTRAINT IF EXISTS people_dni_key;
DROP INDEX IF EXISTS miclub.people_dni_unique_not_null;
DROP INDEX IF EXISTS miclub.people_club_dni_key;

CREATE UNIQUE INDEX people_club_normalized_dni_key
  ON miclub.people (club_id, normalized_dni)
  WHERE normalized_dni IS NOT NULL;

-- A user can have a different tenant-local person profile in every club, but
-- cannot be attached to multiple person records inside the same club.
CREATE UNIQUE INDEX people_club_user_key
  ON miclub.people (club_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX people_user_id_idx
  ON miclub.people (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN miclub.people.user_id IS
  'Vínculo opcional del perfil privado del club con una identidad global en miclub.users.';
COMMENT ON COLUMN miclub.people.normalized_dni IS
  'DNI canónico (solo dígitos), derivado de dni y único dentro del club.';

COMMIT;
