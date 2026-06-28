-- Incremental compatibility migration for an existing miclub_gestion database.
-- Context: designed from the existing dump structure in apps/api/data/db/dump-miclub_gestion-202606260000.txt.
-- Goal: make the current schema safe for apps/api/src/importers/googleSheetsImporter.ts
-- and PostgreSQL dashboard/economy services without dropping data.

create schema if not exists miclub;
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Enums that may be absent in older databases. Existing enum labels are not removed.
do $$ begin
  create type miclub.import_batch_status as enum ('pending', 'running', 'completed', 'completed_with_errors', 'failed', 'dry_run');
exception when duplicate_object then null; end $$;

-- Add labels used by newer app/import code when they are missing from an existing dump.
alter type miclub.enrollment_status add value if not exists 'otro';
alter type miclub.enrollment_status add value if not exists 'cancelado';
alter type miclub.financial_status add value if not exists 'vencido';
alter type miclub.financial_status add value if not exists 'cancelado';
alter type miclub.financial_status add value if not exists 'otro';
alter type miclub.movement_status add value if not exists 'ANULADO';
alter type miclub.person_kind add value if not exists 'acreedor';
alter type miclub.person_kind add value if not exists 'empresa';
alter type miclub.person_kind add value if not exists 'empleado';
alter type miclub.person_kind add value if not exists 'encargado';

-- Ensure columns expected by the Google Sheets importer exist on pre-existing tables.
alter table if exists miclub.enrollments add column if not exists external_id text;
alter table if exists miclub.enrollments add column if not exists due_date date;
alter table if exists miclub.enrollments add column if not exists source text not null default 'app';
alter table if exists miclub.enrollments add column if not exists notes text;

alter table if exists miclub.movements add column if not exists external_id text;
alter table if exists miclub.movements add column if not exists counterparty_text text;
alter table if exists miclub.movements add column if not exists taxes numeric(14,2) not null default 0;
alter table if exists miclub.movements add column if not exists source text not null default 'app';
alter table if exists miclub.movements add column if not exists source_payload jsonb;

alter table if exists miclub.people add column if not exists normalized_phone text;
alter table if exists miclub.people add column if not exists notes text;

alter table if exists miclub.import_batches add column if not exists source_file text;
alter table if exists miclub.import_batches add column if not exists finished_at timestamptz;
alter table if exists miclub.import_batches add column if not exists notes text;

alter table if exists miclub.import_errors add column if not exists source_table text;
alter table if exists miclub.import_errors add column if not exists source_row text;
alter table if exists miclub.import_errors add column if not exists raw_payload jsonb;

-- Unique indexes/constraints required by ON CONFLICT clauses and importer lookups.
create unique index if not exists people_dni_unique_not_null on miclub.people (dni) where dni is not null;
create index if not exists people_name_phone_idx on miclub.people (lower(first_name), lower(last_name), coalesce(normalized_phone, ''));
create unique index if not exists sectors_lower_code_key on miclub.sectors (lower(code));
create unique index if not exists sectors_lower_name_key on miclub.sectors (lower(name));
create unique index if not exists activities_sector_name_modality_key on miclub.activities (sector_id, name, coalesce(modality, ''::text));
create unique index if not exists movement_categories_lower_name_key on miclub.movement_categories (lower(name));
create index if not exists import_errors_batch_id_idx on miclub.import_errors (batch_id, created_at);

-- Add unique constraints only when they do not already exist. These names are used by the app's ON CONFLICT clauses.
do $$ begin
  alter table miclub.payment_methods add constraint payment_methods_name_key unique (name);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table miclub.instructors add constraint instructors_person_id_key unique (person_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table miclub.enrollments add constraint enrollments_external_id_key unique (external_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table miclub.movements add constraint movements_external_id_key unique (external_id);
exception when duplicate_object then null; end $$;


create table if not exists miclub.operational_balances (
  id uuid primary key default gen_random_uuid(),
  cutoff_date date not null default current_date,
  liquidity numeric(14,2) not null default 0,
  cash numeric(14,2) not null default 0,
  bank numeric(14,2) not null default 0,
  dollars numeric(14,2) not null default 0,
  source text not null default 'app',
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists operational_balances_cutoff_date_idx on miclub.operational_balances (cutoff_date desc, created_at desc);
create unique index if not exists operational_balances_source_cutoff_date_key on miclub.operational_balances (source, cutoff_date);

-- Views consumed by services. Column order keeps existing dump view compatibility and app-friendly aliases are appended.
create or replace view miclub.v_current_enrollments as
select
  e.id,
  e.external_id,
  p.first_name,
  p.last_name,
  p.dni,
  p.phone,
  s.code as sector_code,
  s.name as sector_name,
  a.name as activity_name,
  a.modality,
  i.display_name as instructor_name,
  e.fee_amount,
  e.status,
  e.due_date,
  e.last_payment_at,
  e.id as enrollment_id,
  p.id as person_id,
  p.first_name as nombre,
  p.last_name as apellido,
  p.phone as telefono,
  a.name as actividad,
  a.modality as modalidad,
  e.fee_amount as cuota,
  e.status::text as estado,
  i.display_name as instructor,
  e.due_date as vence,
  s.name as source_sheet,
  last_payment.last_payment_amount,
  last_payment.last_payment_source_sheet,
  last_payment.last_payment_concept
from miclub.enrollments e
join miclub.people p on p.id = e.person_id
join miclub.activities a on a.id = e.activity_id
join miclub.sectors s on s.id = a.sector_id
left join miclub.instructors i on i.id = a.instructor_id
left join lateral (
  select m.amount as last_payment_amount, s2.name as last_payment_source_sheet, m.concept as last_payment_concept
  from miclub.movements m
  left join miclub.sectors s2 on s2.id = m.sector_id
  where (m.counterparty_person_id = p.id or m.counterparty_text ilike p.first_name || '%')
    and m.movement_type = 'INGRESOS'
  order by m.movement_date desc, m.created_at desc
  limit 1
) last_payment on true
where e.status <> 'cancelado'::miclub.enrollment_status;

create or replace view miclub.v_movements_enriched as
select
  m.id,
  m.external_id,
  m.movement_date,
  m.movement_type,
  c.name as category,
  s.code as sector_code,
  s.name as sector_name,
  m.concept,
  p.first_name,
  p.last_name,
  p.dni,
  m.counterparty_text,
  m.amount,
  m.taxes,
  pm.name as payment_method,
  m.financial_status,
  m.operational_status,
  m.source,
  m.created_at,
  m.category_id,
  m.sector_id,
  m.counterparty_person_id as person_id,
  m.payment_method_id,
  m.source_payload,
  m.updated_at
from miclub.movements m
left join miclub.movement_categories c on c.id = m.category_id
left join miclub.sectors s on s.id = m.sector_id
left join miclub.people p on p.id = m.counterparty_person_id
left join miclub.payment_methods pm on pm.id = m.payment_method_id;

create or replace view miclub.v_dashboard_basic as
select
  (select count(*) from miclub.people) as total_people,
  (select count(*) from miclub.enrollments where status <> all (array['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) as active_enrollments,
  (select count(*) from miclub.enrollments where status = 'adeudando'::miclub.enrollment_status) as debtor_enrollments,
  (select coalesce(sum(amount), 0) from miclub.receivables where status in ('pendiente', 'parcial', 'vencido')) as receivables_total,
  (select coalesce(sum(amount), 0) from miclub.movements where movement_type = 'INGRESOS' and operational_status = 'COMPLETADO') as total_income,
  (select coalesce(sum(amount), 0) from miclub.movements where movement_type = 'EGRESOS' and operational_status = 'COMPLETADO') as total_expense,
  (select coalesce(sum(case when movement_type = 'INGRESOS' and financial_status = 'pendiente' then amount else 0 end), 0) from miclub.movements) as pending_income,
  (select coalesce(sum(case when movement_type = 'EGRESOS' and financial_status = 'pendiente' then amount else 0 end), 0) from miclub.movements) as pending_expenses,
  (select coalesce(sum(case when movement_type = 'INGRESOS' and financial_status = 'pendiente' then amount when movement_type = 'EGRESOS' and financial_status = 'pendiente' then -amount else 0 end), 0) from miclub.movements) as pending_net_balance,
  coalesce(ob.liquidity, 0) as liquidity,
  coalesce(ob.cash, 0) as cash,
  coalesce(ob.bank, 0) as bank,
  coalesce(ob.dollars, 0) as dollars,
  (select coalesce(sum(fee_amount), 0) from miclub.enrollments where status = 'adeudando') as cuotas_adeudadas,
  (select coalesce(sum(fee_amount), 0) from miclub.enrollments where status in ('adeudando', 'nuevo_inscripto')) as cuotas_a_cobrar,
  (select coalesce(sum(fee_amount), 0) from miclub.enrollments where due_date between current_date and date_trunc('month', current_date)::date + interval '1 month - 1 day') as future_receivable_fees_until_month_end,
  (select coalesce(sum(case when operational_status = 'COMPLETADO' and movement_type = 'INGRESOS' then amount when operational_status = 'COMPLETADO' and movement_type = 'EGRESOS' then -amount else 0 end), 0) from miclub.movements)
    + (select coalesce(sum(amount), 0) from miclub.receivables where status in ('pendiente', 'parcial', 'vencido')) as projected_balance
from (select 1) base
left join lateral (
  select liquidity, cash, bank, dollars
  from miclub.operational_balances
  order by cutoff_date desc, created_at desc
  limit 1
) ob on true;

create or replace view miclub.v_sector_finance_summary as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as total_income,
  coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as settlement_balance,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as total_profitability,
  coalesce(sum(case when date_trunc('month', m.movement_date) = date_trunc('month', now()) and m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when date_trunc('month', m.movement_date) = date_trunc('month', now()) and m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as current_month_profitability
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
group by s.id, s.code, s.name;
