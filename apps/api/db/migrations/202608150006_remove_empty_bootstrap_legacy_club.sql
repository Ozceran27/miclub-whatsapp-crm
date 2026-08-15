-- A fresh database has nothing to backfill. Remove the compatibility tenant in
-- that case, while preserving every restored installation that references it.
DO $$
DECLARE
  legacy_id uuid;
  referenced boolean := false;
  relation record;
BEGIN
  SELECT id INTO legacy_id FROM miclub.clubs WHERE lower(code) = 'legacy';
  IF legacy_id IS NULL THEN RETURN; END IF;

  FOR relation IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.column_name = 'club_id'
      AND c.table_schema = 'miclub'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'clubs'
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE club_id = $1)',
      relation.table_schema, relation.table_name)
      INTO referenced USING legacy_id;
    EXIT WHEN referenced;
  END LOOP;

  IF NOT referenced THEN
    DELETE FROM miclub.clubs WHERE id = legacy_id;
  END IF;
END $$;

