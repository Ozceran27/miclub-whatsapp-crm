-- Regresión manual/integración para una base migrada. Requiere al menos una
-- liquidación existente y se revierte por completo al finalizar.
BEGIN;

DO $test$
DECLARE
  settlement miclub.activity_settlements%ROWTYPE;
  other_club_id uuid := gen_random_uuid();
  cross_tenant_movement_id uuid;
  assigned_movement_id uuid;
BEGIN
  SELECT * INTO settlement
  FROM miclub.activity_settlements
  ORDER BY created_at
  LIMIT 1;

  IF settlement.id IS NULL THEN
    RAISE EXCEPTION 'fixture required: create at least one activity settlement before this test';
  END IF;

  INSERT INTO miclub.clubs (id, code, name)
  VALUES (other_club_id, 'fk-test-' || other_club_id, 'Settlement FK test tenant');

  INSERT INTO miclub.movements
    (club_id, sequence_number, movement_type, concept, amount)
  VALUES
    (other_club_id, miclub.next_tenant_sequence(other_club_id, 'movement'), 'INGRESOS',
     'cross-tenant settlement FK test', 1)
  RETURNING id INTO cross_tenant_movement_id;

  BEGIN
    INSERT INTO miclub.activity_settlement_allocations
      (club_id, settlement_id, movement_id, allocation_type, amount, occurred_at)
    VALUES
      (settlement.club_id, settlement.id, cross_tenant_movement_id, 'PAYMENT', 1, now());
    RAISE EXCEPTION 'cross-tenant allocation was unexpectedly accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO miclub.movements
    (club_id, sequence_number, movement_type, concept, amount)
  VALUES
    (settlement.club_id, miclub.next_tenant_sequence(settlement.club_id, 'movement'), 'INGRESOS',
     'assigned movement delete restriction test', 1)
  RETURNING id INTO assigned_movement_id;

  INSERT INTO miclub.activity_settlement_allocations
    (club_id, settlement_id, movement_id, allocation_type, amount, occurred_at)
  VALUES
    (settlement.club_id, settlement.id, assigned_movement_id, 'PAYMENT', 1, now());

  BEGIN
    DELETE FROM miclub.movements WHERE id = assigned_movement_id;
    RAISE EXCEPTION 'assigned movement deletion was unexpectedly accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END $test$;

ROLLBACK;
