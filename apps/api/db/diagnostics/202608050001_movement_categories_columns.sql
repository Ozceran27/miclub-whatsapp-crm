-- Read-only diagnostic for auditing the deployed shape of miclub.movement_categories.
-- This intentionally does not alter the canonical catalog. Use before designing a
-- versioned migration for category classification metadata.

select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'miclub'
  and c.table_name = 'movement_categories'
order by c.ordinal_position;

select
  'classification_column_availability' as diagnostic,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'miclub' and table_name = 'movement_categories' and column_name = 'direction'
  ) as has_direction,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'miclub' and table_name = 'movement_categories' and column_name in ('classification', 'operational_classification')
  ) as has_operational_classification,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'miclub' and table_name = 'movement_categories' and column_name = 'description'
  ) as has_description,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'miclub' and table_name = 'movement_categories' and column_name = 'club_id'
  ) as has_club_scope;

select
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
 and kcu.table_name = tc.table_name
where tc.table_schema = 'miclub'
  and tc.table_name = 'movement_categories'
group by tc.constraint_name, tc.constraint_type
order by tc.constraint_type, tc.constraint_name;
