-- Script manual para DBeaver: auditoría y ampliación segura de miclub.movements.activity_id.
-- Objetivo:
--   1) Diagnosticar si miclub.movements.activity_id existe y cómo está definida.
--   2) Si falta, agregar activity_id uuid NULL con referencia a miclub.activities(id).
--   3) Crear un índice para consultas tenant/activity/fecha: movements_club_activity_date_idx.
--   4) NO hacer backfill por texto, concepto, counterparty_text, source_payload ni heurísticas.
--   5) Mantener todos los movimientos existentes con activity_id NULL salvo que ya tuvieran
--      un valor explícito antes de ejecutar este script.
--
-- Uso recomendado:
--   A) Ejecutar el bloque completo en DBeaver con Execute SQL Script.
--   B) Revisar los SELECT de diagnóstico antes y después.
--   C) Confirmar que existing_movements_with_activity_after sigue en 0 cuando la columna
--      se acaba de crear. Si no es 0, revisar si esos valores ya existían previamente.
--   D) No agregar ningún UPDATE de backfill en este script.

rollback;

begin;

-- Diagnóstico previo de la columna objetivo ----------------------------------
select
  'movements_activity_id_column_before' as diagnostic,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as exists_now
from (values ('activity_id')) expected(column_name)
left join information_schema.columns c
  on c.table_schema = 'miclub'
 and c.table_name = 'movements'
 and c.column_name = expected.column_name;

select
  'movements_activity_id_fk_before' as diagnostic,
  con.conname,
  con.convalidated,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_attribute att
  on att.attrelid = con.conrelid
 and att.attnum = any(con.conkey)
where con.conrelid = 'miclub.movements'::regclass
  and con.contype = 'f'
  and att.attname = 'activity_id'
order by con.conname;

select
  'movements_activity_id_index_before' as diagnostic,
  schemaname,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'miclub'
  and tablename = 'movements'
  and indexname in ('movements_club_activity_date_idx', 'movements_activity_date_idx')
order by indexname;

-- Alta idempotente de columna faltante ---------------------------------------
-- La columna queda nullable para preservar todos los movimientos históricos sin
-- inventar relaciones por texto. PostgreSQL conserva NULL en las filas existentes.
alter table if exists miclub.movements
  add column if not exists activity_id uuid null references miclub.activities(id);

-- Índice recomendado: tenant + actividad + fecha descendente.
-- Si una instalación legacy aún no tuviera club_id, crear el índice equivalente
-- de fallback sobre activity_id + movement_date.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'miclub'
      and table_name = 'movements'
      and column_name = 'club_id'
  ) then
    create index if not exists movements_club_activity_date_idx
      on miclub.movements (club_id, activity_id, movement_date desc);
  else
    create index if not exists movements_activity_date_idx
      on miclub.movements (activity_id, movement_date desc);
  end if;
end $$;

comment on column miclub.movements.activity_id is
  'Actividad asociada explícitamente al movimiento. Nullable para preservar históricos; no backfillear por texto.';

-- Diagnóstico posterior -------------------------------------------------------
select
  'movements_activity_id_column_after' as diagnostic,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as exists_now
from information_schema.columns c
where c.table_schema = 'miclub'
  and c.table_name = 'movements'
  and c.column_name = 'activity_id';

select
  'movements_activity_id_fk_after' as diagnostic,
  con.conname,
  con.convalidated,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_attribute att
  on att.attrelid = con.conrelid
 and att.attnum = any(con.conkey)
where con.conrelid = 'miclub.movements'::regclass
  and con.contype = 'f'
  and att.attname = 'activity_id'
order by con.conname;

select
  'movements_activity_id_index_after' as diagnostic,
  schemaname,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'miclub'
  and tablename = 'movements'
  and indexname in ('movements_club_activity_date_idx', 'movements_activity_date_idx')
order by indexname;

select
  'existing_movements_with_activity_after' as diagnostic,
  count(*) filter (where activity_id is not null) as movements_with_activity_id,
  count(*) filter (where activity_id is null) as movements_kept_null,
  count(*) as total_movements
from miclub.movements;

commit;
