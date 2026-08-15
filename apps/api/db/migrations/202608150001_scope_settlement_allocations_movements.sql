-- La pertenencia tenant del movimiento asignado se expresa en la FK, no en un trigger.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_definition
    WHERE constraint_definition.conrelid = 'miclub.movements'::regclass
      AND constraint_definition.contype = 'u'
      AND constraint_definition.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'miclub.movements'::regclass AND attname = 'id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'miclub.movements'::regclass AND attname = 'club_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE miclub.movements
      ADD CONSTRAINT movements_id_club_id_key UNIQUE (id, club_id);
  END IF;
END $$;

-- Elimina cualquier FK histórica que cubra únicamente movement_id. El nombre puede
-- diferir entre instalaciones antiguas, por eso se identifica por las columnas.
DO $$
DECLARE
  simple_fkey record;
BEGIN
  FOR simple_fkey IN
    SELECT constraint_definition.conname
    FROM pg_constraint constraint_definition
    WHERE constraint_definition.conrelid = 'miclub.activity_settlement_allocations'::regclass
      AND constraint_definition.confrelid = 'miclub.movements'::regclass
      AND constraint_definition.contype = 'f'
      AND constraint_definition.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'miclub.activity_settlement_allocations'::regclass
           AND attname = 'movement_id')
      ]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE miclub.activity_settlement_allocations DROP CONSTRAINT %I',
      simple_fkey.conname
    );
  END LOOP;
END $$;

ALTER TABLE miclub.activity_settlement_allocations
  DROP CONSTRAINT IF EXISTS activity_settlement_allocations_movement_tenant_fkey;
ALTER TABLE miclub.activity_settlement_allocations
  ADD CONSTRAINT activity_settlement_allocations_movement_tenant_fkey
  FOREIGN KEY (movement_id, club_id)
  REFERENCES miclub.movements (id, club_id)
  ON DELETE RESTRICT;

-- El trigger eliminado sólo duplicaba la regla tenant ahora garantizada por la FK.
DROP TRIGGER IF EXISTS activity_settlement_allocations_validate_tenant
  ON miclub.activity_settlement_allocations;
DROP FUNCTION IF EXISTS miclub.validate_activity_settlement_allocation_tenant();
