-- Script manual para DBeaver: auditoría y ampliación segura de miclub.sectors.
-- Objetivo:
--   1) Auditar columnas esperadas y el estado de max_capacity antes de cualquier backfill.
--   2) Agregar si faltan: club_id, description, icon, status, capacity_mode,
--      configured_capacity, is_system, archived_at, created_by y updated_by.
--   3) Respetar nombres existentes: manager_person_id, opening_time, closing_time
--      y uses_enrollments ya existen y no se renombran.
--   4) Agregar checks como NOT VALID para no bloquear datos actuales hasta ejecutar
--      diagnóstico/backfill y una validación explícita posterior.
--
-- Uso recomendado:
--   A) Ejecutar el bloque completo en DBeaver.
--   B) Revisar los SELECT de diagnóstico, especialmente max_capacity_vs_configured_capacity.
--   C) Si corresponde mapear max_capacity -> configured_capacity, ejecutar manualmente el
--      UPDATE opcional comentado en la sección "Backfill opcional".
--   D) Recién después de limpiar/backfillear datos, ejecutar los VALIDATE CONSTRAINT
--      comentados al final.

rollback;

begin;

-- Diagnóstico previo de columnas esperadas ----------------------------------
with expected_columns(column_name) as (
  values
    ('club_id'),
    ('description'),
    ('icon'),
    ('status'),
    ('capacity_mode'),
    ('configured_capacity'),
    ('is_system'),
    ('archived_at'),
    ('created_by'),
    ('updated_by'),
    ('manager_person_id'),
    ('opening_time'),
    ('closing_time'),
    ('uses_enrollments'),
    ('max_capacity')
)
select
  'sectors_expected_columns_before' as diagnostic,
  e.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as exists_now
from expected_columns e
left join information_schema.columns c
  on c.table_schema = 'miclub'
 and c.table_name = 'sectors'
 and c.column_name = e.column_name
order by e.column_name;

-- Diagnóstico previo para decidir si max_capacity debe mapearse a configured_capacity.
-- Usa SQL dinámico porque configured_capacity podría no existir todavía.
create temp table if not exists tmp_sectors_capacity_diagnostic (
  diagnostic text,
  total_sectors bigint,
  rows_with_max_capacity bigint,
  rows_with_configured_capacity bigint,
  candidates_to_copy_from_max_capacity bigint,
  conflicting_capacity_values bigint,
  min_max_capacity integer,
  max_max_capacity integer,
  min_configured_capacity integer,
  max_configured_capacity integer
) on commit drop;

truncate tmp_sectors_capacity_diagnostic;

do $$
declare
  has_configured_capacity boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'miclub'
      and table_name = 'sectors'
      and column_name = 'configured_capacity'
  ) into has_configured_capacity;

  if has_configured_capacity then
    execute $sql$
      insert into tmp_sectors_capacity_diagnostic
      select
        'max_capacity_vs_configured_capacity_before' as diagnostic,
        count(*) as total_sectors,
        count(*) filter (where max_capacity is not null) as rows_with_max_capacity,
        count(*) filter (where configured_capacity is not null) as rows_with_configured_capacity,
        count(*) filter (where max_capacity is not null and configured_capacity is null) as candidates_to_copy_from_max_capacity,
        count(*) filter (where max_capacity is not null and configured_capacity is not null and max_capacity is distinct from configured_capacity) as conflicting_capacity_values,
        min(max_capacity) as min_max_capacity,
        max(max_capacity) as max_max_capacity,
        min(configured_capacity) as min_configured_capacity,
        max(configured_capacity) as max_configured_capacity
      from miclub.sectors
    $sql$;
  else
    execute $sql$
      insert into tmp_sectors_capacity_diagnostic
      select
        'max_capacity_vs_configured_capacity_before' as diagnostic,
        count(*) as total_sectors,
        count(*) filter (where max_capacity is not null) as rows_with_max_capacity,
        0::bigint as rows_with_configured_capacity,
        count(*) filter (where max_capacity is not null) as candidates_to_copy_from_max_capacity,
        0::bigint as conflicting_capacity_values,
        min(max_capacity) as min_max_capacity,
        max(max_capacity) as max_max_capacity,
        null::integer as min_configured_capacity,
        null::integer as max_configured_capacity
      from miclub.sectors
    $sql$;
  end if;
end $$;

select * from tmp_sectors_capacity_diagnostic;

-- Alta idempotente de columnas faltantes ------------------------------------
alter table if exists miclub.sectors
  add column if not exists club_id uuid references miclub.clubs(id),
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists status text,
  add column if not exists capacity_mode text,
  add column if not exists configured_capacity integer,
  add column if not exists is_system boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

create index if not exists sectors_club_id_idx on miclub.sectors (club_id);
create index if not exists sectors_status_idx on miclub.sectors (status);
create index if not exists sectors_archived_at_idx on miclub.sectors (archived_at);
create index if not exists sectors_created_by_idx on miclub.sectors (created_by);
create index if not exists sectors_updated_by_idx on miclub.sectors (updated_by);

comment on column miclub.sectors.description is 'Descripción funcional del sector. Agregada manualmente sin backfill obligatorio.';
comment on column miclub.sectors.icon is 'Nombre o clave del icono de UI asociado al sector.';
comment on column miclub.sectors.status is 'Estado general del sector. Check agregado como NOT VALID hasta completar diagnóstico/backfill.';
comment on column miclub.sectors.capacity_mode is 'Modo de capacidad del sector. Check agregado como NOT VALID hasta completar diagnóstico/backfill.';
comment on column miclub.sectors.configured_capacity is 'Capacidad configurada nueva. max_capacity se conserva; puede copiarse luego de revisar el diagnóstico.';
comment on column miclub.sectors.is_system is 'Indica sectores base/sistémicos que no deberían tratarse como registros de usuario.';
comment on column miclub.sectors.archived_at is 'Fecha/hora de archivado lógico; NULL indica sector no archivado.';
comment on column miclub.sectors.created_by is 'Persona/usuario que creó el sector, nullable hasta completar trazabilidad.';
comment on column miclub.sectors.updated_by is 'Persona/usuario que actualizó el sector, nullable hasta completar trazabilidad.';

-- Constraints NOT VALID: no validan filas históricas al crearse. Se validan luego
-- de diagnosticar/backfillear datos actuales.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sectors_status_allowed_check' and conrelid = 'miclub.sectors'::regclass) then
    alter table miclub.sectors
      add constraint sectors_status_allowed_check
      check (status is null or status in ('active', 'inactive', 'archived')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sectors_capacity_mode_allowed_check' and conrelid = 'miclub.sectors'::regclass) then
    alter table miclub.sectors
      add constraint sectors_capacity_mode_allowed_check
      check (capacity_mode is null or capacity_mode in ('none', 'fixed', 'unlimited')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sectors_configured_capacity_nonnegative_check' and conrelid = 'miclub.sectors'::regclass) then
    alter table miclub.sectors
      add constraint sectors_configured_capacity_nonnegative_check
      check (configured_capacity is null or configured_capacity >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sectors_capacity_mode_capacity_consistency_check' and conrelid = 'miclub.sectors'::regclass) then
    alter table miclub.sectors
      add constraint sectors_capacity_mode_capacity_consistency_check
      check (
        capacity_mode is null
        or capacity_mode <> 'fixed'
        or configured_capacity is not null
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sectors_created_by_fkey' and conrelid = 'miclub.sectors'::regclass) then
    alter table miclub.sectors
      add constraint sectors_created_by_fkey
      foreign key (created_by) references miclub.people(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sectors_updated_by_fkey' and conrelid = 'miclub.sectors'::regclass) then
    alter table miclub.sectors
      add constraint sectors_updated_by_fkey
      foreign key (updated_by) references miclub.people(id) not valid;
  end if;
end $$;

-- Diagnóstico posterior ------------------------------------------------------
with expected_columns(column_name) as (
  values
    ('club_id'), ('description'), ('icon'), ('status'), ('capacity_mode'),
    ('configured_capacity'), ('is_system'), ('archived_at'), ('created_by'), ('updated_by'),
    ('manager_person_id'), ('opening_time'), ('closing_time'), ('uses_enrollments'), ('max_capacity')
)
select
  'sectors_expected_columns_after' as diagnostic,
  e.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as exists_now
from expected_columns e
left join information_schema.columns c
  on c.table_schema = 'miclub'
 and c.table_name = 'sectors'
 and c.column_name = e.column_name
order by e.column_name;

select
  'sectors_check_constraints_after' as diagnostic,
  conname,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'miclub.sectors'::regclass
  and conname in (
    'sectors_status_allowed_check',
    'sectors_capacity_mode_allowed_check',
    'sectors_configured_capacity_nonnegative_check',
    'sectors_capacity_mode_capacity_consistency_check',
    'sectors_created_by_fkey',
    'sectors_updated_by_fkey'
  )
order by conname;

select
  'max_capacity_vs_configured_capacity_after' as diagnostic,
  count(*) as total_sectors,
  count(*) filter (where max_capacity is not null) as rows_with_max_capacity,
  count(*) filter (where configured_capacity is not null) as rows_with_configured_capacity,
  count(*) filter (where max_capacity is not null and configured_capacity is null) as candidates_to_copy_from_max_capacity,
  count(*) filter (where max_capacity is not null and configured_capacity is not null and max_capacity is distinct from configured_capacity) as conflicting_capacity_values
from miclub.sectors;

commit;

-- Backfill opcional, ejecutar sólo después de revisar el diagnóstico anterior:
-- begin;
-- update miclub.sectors
-- set configured_capacity = max_capacity
-- where configured_capacity is null
--   and max_capacity is not null;
-- commit;

-- Validación opcional, ejecutar sólo después del diagnóstico/backfill/limpieza:
-- alter table miclub.sectors validate constraint sectors_status_allowed_check;
-- alter table miclub.sectors validate constraint sectors_capacity_mode_allowed_check;
-- alter table miclub.sectors validate constraint sectors_configured_capacity_nonnegative_check;
-- alter table miclub.sectors validate constraint sectors_capacity_mode_capacity_consistency_check;
-- alter table miclub.sectors validate constraint sectors_created_by_fkey;
-- alter table miclub.sectors validate constraint sectors_updated_by_fkey;
