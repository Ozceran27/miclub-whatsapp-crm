-- Employee base compensation is independent from activity_terms and settlements.
alter table miclub.employees
  add column if not exists has_fixed_compensation boolean,
  add column if not exists fixed_compensation_amount numeric(14,2),
  add column if not exists fixed_compensation_frequency text;

update miclub.employees
set has_fixed_compensation = payment_mode = 'FIXED',
    fixed_compensation_amount = case when payment_mode = 'FIXED' then monthly_fixed_amount else null end,
    fixed_compensation_frequency = case when payment_mode = 'FIXED' then 'MONTHLY' else null end
where has_fixed_compensation is null;

alter table miclub.employees alter column has_fixed_compensation set default false;
alter table miclub.employees alter column has_fixed_compensation set not null;
alter table miclub.employees add constraint employees_fixed_compensation_check check (
  (has_fixed_compensation and fixed_compensation_amount is not null and fixed_compensation_amount >= 0
    and fixed_compensation_frequency in ('DAILY','WEEKLY','MONTHLY','YEARLY'))
  or (not has_fixed_compensation and fixed_compensation_amount is null and fixed_compensation_frequency is null)
);

comment on column miclub.employees.has_fixed_compensation is 'Whether this employee has personal base compensation; unrelated to activity terms or commissions.';
comment on column miclub.employees.fixed_compensation_frequency is 'Canonical cadence: DAILY, WEEKLY, MONTHLY or YEARLY.';

-- Private object metadata only. Bytes live in the deployment private object store.
create table if not exists miclub.employee_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references miclub.clubs(id),
  employee_id uuid references miclub.employees(id) on delete cascade,
  object_key text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  status text not null default 'temporary' check (status in ('temporary','active','deleted')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (club_id, object_key),
  check ((status = 'temporary' and employee_id is null and expires_at is not null)
      or (status <> 'temporary' and (status = 'deleted' or employee_id is not null)))
);
create unique index if not exists employee_photos_one_active
  on miclub.employee_photos(club_id, employee_id) where status = 'active';
create index if not exists employee_photos_expiry on miclub.employee_photos(expires_at) where status = 'temporary';
alter table miclub.employee_photos enable row level security;
alter table miclub.employee_photos force row level security;
create policy employee_photos_tenant_isolation on miclub.employee_photos
  using (club_id = nullif(current_setting('app.current_club_id', true), '')::uuid)
  with check (club_id = nullif(current_setting('app.current_club_id', true), '')::uuid);
grant select, insert, update, delete on miclub.employee_photos to miclub_app;

-- payment_mode/monthly_fixed_amount intentionally remain for one compatibility
-- window. All application readers/writers have moved; removal is a later migration.
