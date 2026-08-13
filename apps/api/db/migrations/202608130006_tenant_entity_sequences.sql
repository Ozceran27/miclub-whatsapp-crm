-- Tenant-scoped, transactional human-readable numbers. UUID primary keys remain unchanged.
-- Preflight diagnostics: abort before mutating if tenant ownership is incomplete.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.movements WHERE club_id IS NULL)
     OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE club_id IS NULL) THEN
    RAISE EXCEPTION 'sequence backfill aborted: movements/enrollments contain rows without club_id';
  END IF;
END $$;

CREATE TABLE miclub.tenant_sequences (
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('movement', 'enrollment')),
  last_value bigint NOT NULL CHECK (last_value > 0),
  PRIMARY KEY (club_id, entity_type)
);

CREATE FUNCTION miclub.next_tenant_sequence(p_club_id uuid, p_entity_type text)
RETURNS bigint
LANGUAGE sql
VOLATILE
STRICT
AS $function$
  INSERT INTO miclub.tenant_sequences AS tenant_sequence (club_id, entity_type, last_value)
  VALUES (p_club_id, p_entity_type, 1)
  ON CONFLICT (club_id, entity_type)
  DO UPDATE SET last_value = tenant_sequence.last_value + 1
  RETURNING last_value
$function$;

ALTER TABLE miclub.movements ADD COLUMN sequence_number bigint;
ALTER TABLE miclub.enrollments ADD COLUMN sequence_number bigint;

-- Deterministic backfill: creation timestamp first and UUID as the stable tie-breaker.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY club_id ORDER BY created_at NULLS FIRST, id)::bigint AS value
  FROM miclub.movements
)
UPDATE miclub.movements target SET sequence_number = numbered.value FROM numbered WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY club_id ORDER BY created_at NULLS FIRST, id)::bigint AS value
  FROM miclub.enrollments
)
UPDATE miclub.enrollments target SET sequence_number = numbered.value FROM numbered WHERE target.id = numbered.id;

INSERT INTO miclub.tenant_sequences (club_id, entity_type, last_value)
SELECT club_id, 'movement', max(sequence_number) FROM miclub.movements GROUP BY club_id
UNION ALL
SELECT club_id, 'enrollment', max(sequence_number) FROM miclub.enrollments GROUP BY club_id;

-- Validate both completeness and duplicate diagnostics before installing invariants.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.movements WHERE sequence_number IS NULL)
     OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE sequence_number IS NULL) THEN
    RAISE EXCEPTION 'sequence backfill incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM miclub.movements GROUP BY club_id, sequence_number HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM miclub.enrollments GROUP BY club_id, sequence_number HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'sequence backfill produced duplicates';
  END IF;
END $$;

ALTER TABLE miclub.movements ALTER COLUMN sequence_number SET NOT NULL;
ALTER TABLE miclub.enrollments ALTER COLUMN sequence_number SET NOT NULL;
ALTER TABLE miclub.movements ADD CONSTRAINT movements_club_sequence_number_key UNIQUE (club_id, sequence_number);
ALTER TABLE miclub.enrollments ADD CONSTRAINT enrollments_club_sequence_number_key UNIQUE (club_id, sequence_number);
