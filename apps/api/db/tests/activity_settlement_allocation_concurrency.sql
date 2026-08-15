-- Integración PostgreSQL. Requiere la extensión dblink y al menos una liquidación.
-- Ejecutar contra una base migrada con: psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/tests/activity_settlement_allocation_concurrency.sql
--
-- dblink mantiene una segunda sesión real. Esa sesión inserta primero y conserva
-- la transacción abierta un segundo; la sesión principal intenta consumir el mismo
-- movimiento desde otra liquidación y debe recibir unique_violation al confirmarse
-- la primera. Se prueba por separado PAYMENT y ADVANCE.
CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TEMP TABLE settlement_allocation_concurrency_fixture (
  allocation_type text PRIMARY KEY,
  club_id uuid NOT NULL,
  first_settlement_id uuid NOT NULL,
  second_settlement_id uuid NOT NULL,
  movement_id uuid NOT NULL
);

DO $setup$
DECLARE
  template miclub.activity_settlements%ROWTYPE;
  kind text;
  first_id uuid;
  second_id uuid;
  movement uuid;
  offset_days integer := 0;
BEGIN
  SELECT * INTO template FROM miclub.activity_settlements ORDER BY created_at LIMIT 1;
  IF template.id IS NULL THEN
    RAISE EXCEPTION 'fixture required: create at least one activity settlement before this test';
  END IF;

  FOREACH kind IN ARRAY ARRAY['PAYMENT', 'ADVANCE'] LOOP
    offset_days := offset_days + 2;
    INSERT INTO miclub.activity_settlements
      (club_id, activity_id, activity_term_id, period_from, period_to)
    VALUES
      (template.club_id, template.activity_id, template.activity_term_id,
       DATE '2999-01-01' + offset_days, DATE '2999-01-01' + offset_days)
    RETURNING id INTO first_id;
    INSERT INTO miclub.activity_settlements
      (club_id, activity_id, activity_term_id, period_from, period_to)
    VALUES
      (template.club_id, template.activity_id, template.activity_term_id,
       DATE '2999-01-02' + offset_days, DATE '2999-01-02' + offset_days)
    RETURNING id INTO second_id;
    INSERT INTO miclub.movements
      (club_id, sequence_number, movement_type, concept, amount)
    VALUES
      (template.club_id, miclub.next_tenant_sequence(template.club_id, 'movement'),
       'INGRESOS', 'settlement allocation concurrency ' || kind, 100)
    RETURNING id INTO movement;
    INSERT INTO settlement_allocation_concurrency_fixture
    VALUES (kind, template.club_id, first_id, second_id, movement);
  END LOOP;
END $setup$;

-- Las conexiones dblink sólo pueden ver el fixture después del commit.
COMMIT;

DO $test$
DECLARE
  fixture settlement_allocation_concurrency_fixture%ROWTYPE;
  connection_name text;
BEGIN
  FOR fixture IN SELECT * FROM settlement_allocation_concurrency_fixture ORDER BY allocation_type LOOP
    connection_name := 'allocation_' || lower(fixture.allocation_type);
    PERFORM dblink_connect(connection_name, format('dbname=%s', current_database()));
    PERFORM dblink_send_query(connection_name, format($remote$
      BEGIN;
      INSERT INTO miclub.activity_settlement_allocations
        (club_id, settlement_id, movement_id, allocation_type, amount, occurred_at)
      VALUES (%L, %L, %L, %L, 100, now());
      SELECT pg_sleep(1);
      COMMIT;
    $remote$, fixture.club_id, fixture.first_settlement_id, fixture.movement_id, fixture.allocation_type));
    PERFORM pg_sleep(0.2);

    BEGIN
      INSERT INTO miclub.activity_settlement_allocations
        (club_id, settlement_id, movement_id, allocation_type, amount, occurred_at)
      VALUES
        (fixture.club_id, fixture.second_settlement_id, fixture.movement_id,
         fixture.allocation_type, 100, now());
      RAISE EXCEPTION '% concurrent allocation was unexpectedly accepted', fixture.allocation_type;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;

    WHILE dblink_is_busy(connection_name) = 1 LOOP PERFORM pg_sleep(0.05); END LOOP;
    PERFORM dblink_get_result(connection_name);
    PERFORM dblink_disconnect(connection_name);
  END LOOP;
END $test$;

DELETE FROM miclub.activity_settlement_allocations
WHERE movement_id IN (SELECT movement_id FROM settlement_allocation_concurrency_fixture);
DELETE FROM miclub.movements
WHERE id IN (SELECT movement_id FROM settlement_allocation_concurrency_fixture);
DELETE FROM miclub.activity_settlements
WHERE id IN (
  SELECT first_settlement_id FROM settlement_allocation_concurrency_fixture
  UNION ALL
  SELECT second_settlement_id FROM settlement_allocation_concurrency_fixture
);
