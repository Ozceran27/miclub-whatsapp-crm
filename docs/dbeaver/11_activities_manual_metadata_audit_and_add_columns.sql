-- Script manual para DBeaver: auditoría y ampliación segura de miclub.activities.
-- Objetivo:
--   1) Auditar columnas esperadas antes de cualquier DDL.
--   2) Agregar si faltan: club_id, description, generates_enrollments,
--      settlement_mode, settlement_fixed_amount, settlement_category_id,
--      archived_at, created_by y updated_by.
--   3) Reutilizar columnas existentes de activities; NO crear tabla paralela de
--      actividades ni renombrar campos legacy: sector_id, manager_person_id,
--      instructor_id, monthly_fee, club_commission_percent,
--      instructor_commission_percent, status, color, code y notes.
--   4) Agregar índices y constraints NOT VALID para no bloquear datos históricos
--      hasta revisar/backfillear y validar explícitamente.
--
-- Uso recomendado:
--   A) Ejecutar el bloque completo en DBeaver con Execute SQL Script.
--   B) Revisar los SELECT de diagnóstico antes/después.
--   C) Hacer backfill manual de club_id/settlement_* sólo con criterio operativo
--      confirmado. Este script no inventa datos ni reasigna actividades.
--   D) Recién después de limpiar/backfillear datos, ejecutar los VALIDATE
--      CONSTRAINT comentados al final.

rollback;

begin;

-- Diagnóstico previo de columnas esperadas y columnas legacy que se reutilizan --
with expected_columns(column_name, purpose) as (
  values
    ('club_id', 'agregar si falta'),
    ('description', 'agregar si falta'),
    ('generates_enrollments', 'agregar si falta'),
    ('settlement_mode', 'agregar si falta'),
    ('settlement_fixed_amount', 'agregar si falta'),
    ('settlement_category_id', 'agregar si falta'),
    ('archived_at', 'agregar si falta'),
    ('created_by', 'agregar si falta'),
    ('updated_by', 'agregar si falta'),
    ('sector_id', 'reutilizar existente'),
    ('manager_person_id', 'reutilizar existente'),
    ('instructor_id', 'reutilizar existente'),
    ('monthly_fee', 'reutilizar existente'),
    ('club_commission_percent', 'reutilizar existente'),
    ('instructor_commission_percent', 'reutilizar existente'),
    ('status', 'reutilizar existente'),
    ('color', 'reutilizar existente'),
    ('code', 'reutilizar existente'),
    ('notes', 'reutilizar existente')
)
select
  'activities_expected_columns_before' as diagnostic,
  e.purpose,
  e.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as exists_now
from expected_columns e
left join information_schema.columns c
  on c.table_schema = 'miclub'
 and c.table_name = 'activities'
 and c.column_name = e.column_name
order by e.purpose, e.column_name;

-- Diagnóstico previo intencionalmente limitado a information_schema: algunas columnas
-- nuevas podrían no existir todavía, por lo que las métricas de datos se emiten
-- después del ALTER TABLE idempotente.

-- Alta idempotente de columnas faltantes ------------------------------------
alter table if exists miclub.activities
  add column if not exists club_id uuid references miclub.clubs(id),
  add column if not exists description text,
  add column if not exists generates_enrollments boolean not null default true,
  add column if not exists settlement_mode text,
  add column if not exists settlement_fixed_amount numeric(14,2),
  add column if not exists settlement_category_id uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

create index if not exists activities_club_id_idx on miclub.activities (club_id);
create index if not exists activities_archived_at_idx on miclub.activities (archived_at);
create index if not exists activities_created_by_idx on miclub.activities (created_by);
create index if not exists activities_updated_by_idx on miclub.activities (updated_by);
create index if not exists activities_settlement_category_id_idx on miclub.activities (settlement_category_id);
create index if not exists activities_settlement_mode_idx on miclub.activities (settlement_mode);

comment on table miclub.activities is 'Catálogo único de actividades. No crear tablas paralelas para modelar actividades.';
comment on column miclub.activities.club_id is 'Tenant propietario de la actividad; debe coincidir con sector/personas/categorías relacionadas.';
comment on column miclub.activities.description is 'Descripción funcional extendida de la actividad.';
comment on column miclub.activities.generates_enrollments is 'Indica si la actividad genera inscripciones operativas.';
comment on column miclub.activities.settlement_mode is 'Modo de liquidación de la actividad; constraint NOT VALID hasta completar diagnóstico/backfill.';
comment on column miclub.activities.settlement_fixed_amount is 'Monto fijo de liquidación cuando settlement_mode lo requiera.';
comment on column miclub.activities.settlement_category_id is 'Categoría de movimiento asociada a la liquidación de la actividad.';
comment on column miclub.activities.archived_at is 'Fecha/hora de archivado lógico; NULL indica actividad no archivada.';
comment on column miclub.activities.created_by is 'Persona/usuario que creó la actividad, nullable hasta completar trazabilidad.';
comment on column miclub.activities.updated_by is 'Persona/usuario que actualizó la actividad, nullable hasta completar trazabilidad.';

-- Constraints NOT VALID: se agregan sin validar filas históricas existentes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_settlement_mode_allowed_check' and conrelid = 'miclub.activities'::regclass) then
    alter table miclub.activities
      add constraint activities_settlement_mode_allowed_check
      check (settlement_mode is null or settlement_mode in ('none', 'percent', 'fixed', 'category')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activities_settlement_fixed_amount_nonnegative_check' and conrelid = 'miclub.activities'::regclass) then
    alter table miclub.activities
      add constraint activities_settlement_fixed_amount_nonnegative_check
      check (settlement_fixed_amount is null or settlement_fixed_amount >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activities_settlement_fixed_amount_required_check' and conrelid = 'miclub.activities'::regclass) then
    alter table miclub.activities
      add constraint activities_settlement_fixed_amount_required_check
      check (settlement_mode is distinct from 'fixed' or settlement_fixed_amount is not null) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activities_settlement_category_fkey' and conrelid = 'miclub.activities'::regclass) then
    alter table miclub.activities
      add constraint activities_settlement_category_fkey
      foreign key (settlement_category_id) references miclub.movement_categories(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activities_created_by_fkey' and conrelid = 'miclub.activities'::regclass) then
    alter table miclub.activities
      add constraint activities_created_by_fkey
      foreign key (created_by) references miclub.people(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activities_updated_by_fkey' and conrelid = 'miclub.activities'::regclass) then
    alter table miclub.activities
      add constraint activities_updated_by_fkey
      foreign key (updated_by) references miclub.people(id) not valid;
  end if;
end $$;

-- Diagnóstico posterior ------------------------------------------------------
with expected_columns(column_name, purpose) as (
  values
    ('club_id', 'agregar si falta'), ('description', 'agregar si falta'),
    ('generates_enrollments', 'agregar si falta'), ('settlement_mode', 'agregar si falta'),
    ('settlement_fixed_amount', 'agregar si falta'), ('settlement_category_id', 'agregar si falta'),
    ('archived_at', 'agregar si falta'), ('created_by', 'agregar si falta'), ('updated_by', 'agregar si falta'),
    ('sector_id', 'reutilizar existente'), ('manager_person_id', 'reutilizar existente'),
    ('instructor_id', 'reutilizar existente'), ('monthly_fee', 'reutilizar existente'),
    ('club_commission_percent', 'reutilizar existente'), ('instructor_commission_percent', 'reutilizar existente'),
    ('status', 'reutilizar existente'), ('color', 'reutilizar existente'), ('code', 'reutilizar existente'),
    ('notes', 'reutilizar existente')
)
select
  'activities_expected_columns_after' as diagnostic,
  e.purpose,
  e.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.column_name is not null as exists_now
from expected_columns e
left join information_schema.columns c
  on c.table_schema = 'miclub'
 and c.table_name = 'activities'
 and c.column_name = e.column_name
order by e.purpose, e.column_name;

select
  'activities_constraints_after' as diagnostic,
  conname,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'miclub.activities'::regclass
  and conname in (
    'activities_settlement_mode_allowed_check',
    'activities_settlement_fixed_amount_nonnegative_check',
    'activities_settlement_fixed_amount_required_check',
    'activities_settlement_category_fkey',
    'activities_created_by_fkey',
    'activities_updated_by_fkey'
  )
order by conname;

select
  'activities_relationships_after' as diagnostic,
  count(*) as total_activities,
  count(*) filter (where club_id is null) as rows_without_club_id,
  count(*) filter (where sector_id is null) as rows_without_sector_id,
  count(*) filter (where instructor_id is null) as rows_without_instructor_id,
  count(*) filter (where manager_person_id is null) as rows_without_manager_person_id,
  count(*) filter (where settlement_mode = 'fixed' and settlement_fixed_amount is null) as fixed_settlements_without_amount,
  count(*) filter (where settlement_fixed_amount < 0) as negative_settlement_fixed_amounts
from miclub.activities;

commit;

-- Validación opcional, ejecutar sólo después del diagnóstico/backfill/limpieza:
-- alter table miclub.activities validate constraint activities_settlement_mode_allowed_check;
-- alter table miclub.activities validate constraint activities_settlement_fixed_amount_nonnegative_check;
-- alter table miclub.activities validate constraint activities_settlement_fixed_amount_required_check;
-- alter table miclub.activities validate constraint activities_settlement_category_fkey;
-- alter table miclub.activities validate constraint activities_created_by_fkey;
-- alter table miclub.activities validate constraint activities_updated_by_fkey;
