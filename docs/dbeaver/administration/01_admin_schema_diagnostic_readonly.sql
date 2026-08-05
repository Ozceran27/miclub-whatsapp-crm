/*
  miClub — diagnóstico administrativo de schema SOLO LECTURA.

  Objetivo: inventariar tablas, columnas, constraints, índices y recuentos
  básicos para las tablas administrativas/operativas principales.

  Uso en DBeaver/PostgreSQL:
  - Ejecutar el archivo completo.
  - No modifica datos: la transacción se declara READ ONLY y termina en ROLLBACK.
*/

BEGIN;
SET TRANSACTION READ ONLY;

WITH target_tables(table_name, ordinal) AS (
  VALUES
    ('clubs', 1),
    ('users', 2),
    ('people', 3),
    ('roles', 4),
    ('user_club_memberships', 5),
    ('sectors', 6),
    ('activities', 7),
    ('instructors', 8),
    ('enrollments', 9),
    ('movements', 10),
    ('movement_categories', 11),
    ('payment_methods', 12),
    ('payments', 13),
    ('receivables', 14),
    ('audit_log', 15),
    ('employees', 16),
    ('tasks', 17),
    ('approval_requests', 18)
)
SELECT
  'table_inventory' AS diagnostic,
  tt.ordinal,
  'miclub' AS expected_schema,
  tt.table_name,
  CASE WHEN t.table_name IS NULL THEN false ELSE true END AS table_exists,
  t.table_type
FROM target_tables tt
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'miclub'
 AND t.table_name = tt.table_name
ORDER BY tt.ordinal;

WITH target_tables(table_name, ordinal) AS (
  VALUES
    ('clubs', 1), ('users', 2), ('people', 3), ('roles', 4),
    ('user_club_memberships', 5), ('sectors', 6), ('activities', 7),
    ('instructors', 8), ('enrollments', 9), ('movements', 10),
    ('movement_categories', 11), ('payment_methods', 12), ('payments', 13),
    ('receivables', 14), ('audit_log', 15), ('employees', 16), ('tasks', 17),
    ('approval_requests', 18)
)
SELECT
  'columns' AS diagnostic,
  tt.ordinal AS table_ordinal,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale
FROM target_tables tt
JOIN information_schema.columns c
  ON c.table_schema = 'miclub'
 AND c.table_name = tt.table_name
ORDER BY tt.ordinal, c.ordinal_position;

WITH target_tables(table_name, ordinal) AS (
  VALUES
    ('clubs', 1), ('users', 2), ('people', 3), ('roles', 4),
    ('user_club_memberships', 5), ('sectors', 6), ('activities', 7),
    ('instructors', 8), ('enrollments', 9), ('movements', 10),
    ('movement_categories', 11), ('payment_methods', 12), ('payments', 13),
    ('receivables', 14), ('audit_log', 15), ('employees', 16), ('tasks', 17),
    ('approval_requests', 18)
)
SELECT
  'constraints' AS diagnostic,
  tt.ordinal AS table_ordinal,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns,
  ccu.table_schema AS referenced_schema,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM target_tables tt
JOIN information_schema.table_constraints tc
  ON tc.table_schema = 'miclub'
 AND tc.table_name = tt.table_name
LEFT JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema = tc.table_schema
 AND kcu.table_name = tc.table_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_schema = tc.constraint_schema
 AND ccu.constraint_name = tc.constraint_name
GROUP BY
  tt.ordinal,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  ccu.table_schema,
  ccu.table_name,
  ccu.column_name
ORDER BY tt.ordinal, tc.constraint_type, tc.constraint_name;

WITH target_tables(table_name, ordinal) AS (
  VALUES
    ('clubs', 1), ('users', 2), ('people', 3), ('roles', 4),
    ('user_club_memberships', 5), ('sectors', 6), ('activities', 7),
    ('instructors', 8), ('enrollments', 9), ('movements', 10),
    ('movement_categories', 11), ('payment_methods', 12), ('payments', 13),
    ('receivables', 14), ('audit_log', 15), ('employees', 16), ('tasks', 17),
    ('approval_requests', 18)
)
SELECT
  'indexes' AS diagnostic,
  tt.ordinal AS table_ordinal,
  i.tablename AS table_name,
  i.indexname,
  i.indexdef
FROM target_tables tt
JOIN pg_indexes i
  ON i.schemaname = 'miclub'
 AND i.tablename = tt.table_name
ORDER BY tt.ordinal, i.indexname;

WITH target_tables(table_name, ordinal) AS (
  VALUES
    ('clubs', 1), ('users', 2), ('people', 3), ('roles', 4),
    ('user_club_memberships', 5), ('sectors', 6), ('activities', 7),
    ('instructors', 8), ('enrollments', 9), ('movements', 10),
    ('movement_categories', 11), ('payment_methods', 12), ('payments', 13),
    ('receivables', 14), ('audit_log', 15), ('employees', 16), ('tasks', 17),
    ('approval_requests', 18)
), existing_tables AS (
  SELECT
    tt.ordinal,
    tt.table_name,
    to_regclass(format('miclub.%I', tt.table_name)) AS table_regclass,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'miclub'
        AND c.table_name = tt.table_name
        AND c.column_name = 'club_id'
    ) AS has_club_id,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'miclub'
        AND c.table_name = tt.table_name
        AND c.column_name = 'created_at'
    ) AS has_created_at,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'miclub'
        AND c.table_name = tt.table_name
        AND c.column_name = 'updated_at'
    ) AS has_updated_at
  FROM target_tables tt
)
SELECT
  'basic_counts' AS diagnostic,
  et.ordinal AS table_ordinal,
  et.table_name,
  CASE WHEN et.table_regclass IS NULL THEN false ELSE true END AS table_exists,
  CASE
    WHEN et.table_regclass IS NULL THEN NULL
    ELSE ((xpath('/row/row_count/text()', query_to_xml(format('SELECT count(*) AS row_count FROM miclub.%I', et.table_name), false, true, '')))[1])::text::bigint
  END AS exact_row_count,
  CASE
    WHEN et.table_regclass IS NULL OR NOT et.has_club_id THEN NULL
    ELSE ((xpath('/row/without_club/text()', query_to_xml(format('SELECT count(*) AS without_club FROM miclub.%I WHERE club_id IS NULL', et.table_name), false, true, '')))[1])::text::bigint
  END AS rows_without_club_id,
  CASE
    WHEN et.table_regclass IS NULL OR NOT et.has_created_at THEN NULL
    ELSE ((xpath('/row/min_created_at/text()', query_to_xml(format('SELECT min(created_at)::text AS min_created_at FROM miclub.%I', et.table_name), false, true, '')))[1])::text
  END AS min_created_at,
  CASE
    WHEN et.table_regclass IS NULL OR NOT et.has_created_at THEN NULL
    ELSE ((xpath('/row/max_created_at/text()', query_to_xml(format('SELECT max(created_at)::text AS max_created_at FROM miclub.%I', et.table_name), false, true, '')))[1])::text
  END AS max_created_at,
  CASE
    WHEN et.table_regclass IS NULL OR NOT et.has_updated_at THEN NULL
    ELSE ((xpath('/row/max_updated_at/text()', query_to_xml(format('SELECT max(updated_at)::text AS max_updated_at FROM miclub.%I', et.table_name), false, true, '')))[1])::text
  END AS max_updated_at
FROM existing_tables et
ORDER BY et.ordinal;

ROLLBACK;
