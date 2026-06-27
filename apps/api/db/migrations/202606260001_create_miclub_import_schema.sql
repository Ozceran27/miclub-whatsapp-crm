-- Schema required by apps/api/src/importers/googleSheetsImporter.ts and PostgreSQL services.
-- Apply before running: npm run import:sheets:dry

create schema if not exists miclub;
create extension if not exists pgcrypto;

-- Enums ---------------------------------------------------------------------
do $$ begin
  create type miclub.person_kind as enum ('alumno', 'instructor', 'proveedor', 'cliente', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type miclub.enrollment_status as enum ('al_dia', 'nuevo_inscripto', 'adeudando', 'abandonado', 'cancelado', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type miclub.movement_type as enum ('INGRESOS', 'EGRESOS', 'CAPITAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type miclub.financial_status as enum ('sin_movimientos', 'pendiente', 'pagado', 'parcial', 'a_liquidar', 'liquidado', 'deuda', 'vencido', 'cancelado', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type miclub.movement_status as enum ('PENDIENTE', 'COMPLETADO', 'CANCELADO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type miclub.import_batch_status as enum ('pending', 'running', 'completed', 'completed_with_errors', 'failed', 'dry_run');
exception when duplicate_object then null; end $$;

-- Core people and catalog tables --------------------------------------------
create table if not exists miclub.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default ' ',
  dni text,
  phone text,
  normalized_phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists people_dni_unique_not_null on miclub.people (dni) where dni is not null;
create index if not exists people_name_phone_idx on miclub.people (lower(first_name), lower(last_name), coalesce(normalized_phone, ''));

create table if not exists miclub.person_kind_links (
  person_id uuid not null references miclub.people(id) on delete cascade,
  kind miclub.person_kind not null,
  created_at timestamptz not null default now(),
  primary key (person_id, kind)
);

create table if not exists miclub.sectors (
  id uuid primary key default gen_random_uuid(),
  manager_person_id uuid references miclub.people(id),
  code text not null,
  name text not null,
  color text,
  opening_time time,
  closing_time time,
  max_capacity integer,
  municipal_status text,
  financial_status text,
  operational_status text,
  uses_enrollments boolean not null default false,
  uses_activities boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sectors_code_key unique (code),
  constraint sectors_name_key unique (name)
);
create unique index if not exists sectors_lower_code_key on miclub.sectors (lower(code));
create unique index if not exists sectors_lower_name_key on miclub.sectors (lower(name));

create table if not exists miclub.instructors (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references miclub.people(id) on delete cascade,
  code text,
  display_name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructors_person_id_key unique (person_id),
  constraint instructors_code_key unique (code)
);

create table if not exists miclub.activities (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references miclub.sectors(id),
  manager_person_id uuid references miclub.people(id),
  instructor_id uuid references miclub.instructors(id),
  code text,
  name text not null,
  modality text,
  color text,
  monthly_fee numeric(14,2) not null default 0,
  club_commission_percent numeric(5,2) not null default 0,
  instructor_commission_percent numeric(5,2) not null default 0,
  max_capacity integer,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_code_key unique (code)
);
create unique index if not exists activities_sector_name_modality_key on miclub.activities (sector_id, name, coalesce(modality, ''::text));

create table if not exists miclub.movement_categories (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  direction miclub.movement_type,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint movement_categories_name_key unique (name),
  constraint movement_categories_code_key unique (code)
);
create unique index if not exists movement_categories_lower_name_key on miclub.movement_categories (lower(name));

create table if not exists miclub.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint payment_methods_name_key unique (name)
);

-- Enrollment and movement facts ---------------------------------------------
create table if not exists miclub.enrollments (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  person_id uuid not null references miclub.people(id),
  activity_id uuid not null references miclub.activities(id),
  fee_amount numeric(14,2) not null default 0,
  status miclub.enrollment_status not null default 'nuevo_inscripto',
  due_date date,
  source text not null default 'manual',
  notes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_external_id_key unique (external_id)
);
create index if not exists enrollments_person_id_idx on miclub.enrollments (person_id);
create index if not exists enrollments_activity_id_idx on miclub.enrollments (activity_id);

create table if not exists miclub.movements (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  movement_date timestamptz not null,
  movement_type miclub.movement_type not null,
  category_id uuid references miclub.movement_categories(id),
  sector_id uuid references miclub.sectors(id),
  concept text not null,
  person_id uuid references miclub.people(id),
  counterparty_text text,
  amount numeric(14,2) not null default 0,
  taxes numeric(14,2) not null default 0,
  payment_method_id uuid references miclub.payment_methods(id),
  financial_status miclub.financial_status not null default 'otro',
  operational_status miclub.movement_status not null default 'COMPLETADO',
  source text not null default 'manual',
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movements_external_id_key unique (external_id)
);
create index if not exists movements_date_idx on miclub.movements (movement_date desc);
create index if not exists movements_sector_id_idx on miclub.movements (sector_id);
create index if not exists movements_category_id_idx on miclub.movements (category_id);

-- Import audit ----------------------------------------------------------------
create table if not exists miclub.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_file text,
  status miclub.import_batch_status not null default 'pending',
  notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists miclub.import_errors (
  id bigserial primary key,
  batch_id uuid not null references miclub.import_batches(id) on delete cascade,
  source_table text not null,
  source_row text not null,
  error_message text not null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_errors_batch_id_idx on miclub.import_errors (batch_id, created_at);

-- Additional tables referenced by financial/catalog services -----------------
create table if not exists miclub.payments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references miclub.people(id),
  payment_method_id uuid references miclub.payment_methods(id),
  amount numeric(14,2) not null default 0,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists miclub.payment_allocations (
  id bigserial primary key,
  payment_id uuid not null references miclub.payments(id) on delete cascade,
  enrollment_id uuid references miclub.enrollments(id),
  movement_id uuid references miclub.movements(id),
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists miclub.receivables (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references miclub.people(id),
  enrollment_id uuid references miclub.enrollments(id),
  due_date date,
  amount numeric(14,2) not null default 0,
  status miclub.financial_status not null default 'pendiente',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists miclub.currencies (code text primary key, name text not null, symbol text not null);
create table if not exists miclub.discount_rates (id uuid primary key default gen_random_uuid(), percent numeric(5,2) not null, label text, is_active boolean not null default true, created_at timestamptz not null default now());
create table if not exists miclub.roles (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text, created_at timestamptz not null default now());
create table if not exists miclub.salon_hour_prices (id uuid primary key default gen_random_uuid(), hours numeric(6,2) not null, price numeric(14,2) not null, is_active boolean not null default true, created_at timestamptz not null default now());
create table if not exists miclub.system_months (id uuid primary key default gen_random_uuid(), year integer not null, month integer not null check (month between 1 and 12), label text, starts_on date, ends_on date, is_closed boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(year, month));

insert into miclub.currencies (code, name, symbol) values ('ARS', 'Peso argentino', '$'), ('USD', 'Dólar estadounidense', 'US$') on conflict (code) do nothing;

-- Views consumed by services and repositories --------------------------------
create or replace view miclub.v_current_enrollments as
select
  e.id,
  e.id as enrollment_id,
  p.id as person_id,
  p.first_name,
  p.first_name as nombre,
  p.last_name,
  p.last_name as apellido,
  p.dni,
  p.phone,
  p.phone as telefono,
  a.name as activity_name,
  a.name as actividad,
  a.modality,
  a.modality as modalidad,
  e.fee_amount,
  e.fee_amount as cuota,
  e.status,
  e.status::text as estado,
  i.display_name as instructor_name,
  i.display_name as instructor,
  e.due_date,
  e.due_date as vence,
  s.code as sector_code,
  s.name as sector_name,
  s.name as source_sheet,
  last_payment.last_payment_at,
  last_payment.last_payment_amount,
  last_payment.last_payment_source_sheet,
  last_payment.last_payment_concept
from miclub.enrollments e
join miclub.people p on p.id = e.person_id
join miclub.activities a on a.id = e.activity_id
join miclub.sectors s on s.id = a.sector_id
left join miclub.instructors i on i.id = a.instructor_id
left join lateral (
  select m.movement_date as last_payment_at, m.amount as last_payment_amount, s2.name as last_payment_source_sheet, m.concept as last_payment_concept
  from miclub.movements m
  left join miclub.sectors s2 on s2.id = m.sector_id
  where (m.person_id = p.id or m.counterparty_text ilike p.first_name || '%') and m.movement_type = 'INGRESOS'
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
  m.category_id,
  mc.name as category,
  m.sector_id,
  s.code as sector_code,
  s.name as sector_name,
  m.concept,
  m.person_id,
  p.first_name,
  p.last_name,
  m.counterparty_text,
  m.amount,
  m.taxes,
  m.payment_method_id,
  pm.name as payment_method,
  m.financial_status,
  m.operational_status,
  m.source,
  m.source_payload,
  m.created_at,
  m.updated_at
from miclub.movements m
left join miclub.movement_categories mc on mc.id = m.category_id
left join miclub.sectors s on s.id = m.sector_id
left join miclub.people p on p.id = m.person_id
left join miclub.payment_methods pm on pm.id = m.payment_method_id;

create or replace view miclub.v_dashboard_basic as
select
  coalesce(sum(case when movement_type = 'INGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as total_income,
  coalesce(sum(case when movement_type = 'EGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as total_expense,
  coalesce(sum(case when movement_type = 'INGRESOS' and financial_status = 'pendiente' then amount else 0 end), 0) as pending_income,
  coalesce(sum(case when movement_type = 'EGRESOS' and financial_status = 'pendiente' then amount else 0 end), 0) as pending_expenses,
  coalesce(sum(case when movement_type = 'INGRESOS' and financial_status = 'pendiente' then amount when movement_type = 'EGRESOS' and financial_status = 'pendiente' then -amount else 0 end), 0) as pending_net_balance,
  coalesce(sum(case when operational_status = 'COMPLETADO' and movement_type = 'INGRESOS' then amount when operational_status = 'COMPLETADO' and movement_type = 'EGRESOS' then -amount else 0 end), 0) as liquidity,
  coalesce(sum(case when operational_status = 'COMPLETADO' and movement_type = 'INGRESOS' then amount when operational_status = 'COMPLETADO' and movement_type = 'EGRESOS' then -amount else 0 end), 0) as cash,
  0::numeric as bank,
  0::numeric as dollars,
  (select coalesce(sum(amount), 0) from miclub.receivables where status in ('pendiente', 'vencido')) as receivables_total,
  (select count(*) from miclub.people) as total_people,
  (select count(*) from miclub.enrollments where status <> all (array['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) as active_enrollments,
  (select count(*) from miclub.enrollments where status = 'adeudando') as debtor_enrollments,
  (select coalesce(sum(fee_amount), 0) from miclub.enrollments where status = 'adeudando') as cuotas_adeudadas,
  (select coalesce(sum(fee_amount), 0) from miclub.enrollments where status in ('adeudando', 'nuevo_inscripto')) as cuotas_a_cobrar,
  (select coalesce(sum(fee_amount), 0) from miclub.enrollments where due_date between current_date and date_trunc('month', current_date)::date + interval '1 month - 1 day') as future_receivable_fees_until_month_end,
  coalesce(sum(case when operational_status = 'COMPLETADO' and movement_type = 'INGRESOS' then amount when operational_status = 'COMPLETADO' and movement_type = 'EGRESOS' then -amount else 0 end), 0)
    + (select coalesce(sum(amount), 0) from miclub.receivables where status in ('pendiente', 'vencido')) as projected_balance
from miclub.movements;

create or replace view miclub.v_sector_finance_summary as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount else 0 end), 0) as total_income,
  coalesce(sum(case when m.movement_type = 'EGRESOS' then m.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as balance,
  coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as settlement_balance,
  coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as total_profitability,
  coalesce(sum(case when date_trunc('month', m.movement_date) = date_trunc('month', now()) and m.movement_type = 'INGRESOS' then m.amount when date_trunc('month', m.movement_date) = date_trunc('month', now()) and m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as current_month_profitability
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id and m.operational_status = 'COMPLETADO'
group by s.id, s.code, s.name;
