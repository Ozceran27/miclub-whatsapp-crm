-- Auditoría opcional de normalización de cuotas importadas desde Google Sheets.
-- No es necesaria para calcular cuotas a cobrar si alcanza con normalizar en la
-- vista; sí es necesaria cuando se quiere conservar trazabilidad del texto crudo,
-- del número parseado y de la razón de ajuste por escala.
--
-- fee_amount queda temporalmente por compatibilidad; los cálculos nuevos deben leer
-- normalized_fee_amount para evitar depender de re-normalizaciones ad-hoc.

begin;

create or replace function miclub.normalize_enrollment_fee_amount(value numeric)
returns numeric
language sql
immutable
as $$
  with recursive fee_steps(fee) as (
    select coalesce(value, 0::numeric)::numeric
    union all
    select fee / 10
    from fee_steps
    where abs(fee) > 100000::numeric
      and mod(fee, 10::numeric) = 0::numeric
  )
  select fee::numeric(14,2)
  from fee_steps
  order by abs(fee) asc
  limit 1
$$;

alter table miclub.enrollments
  add column if not exists raw_fee_amount_text text,
  add column if not exists raw_fee_amount numeric(14,2),
  add column if not exists normalized_fee_amount numeric(14,2),
  add column if not exists fee_normalization_reason text,
  add column if not exists fee_normalized_at timestamptz;

comment on column miclub.enrollments.fee_amount is
  'Compatibilidad temporal. Los calculos de cuotas a cobrar deben leer normalized_fee_amount.';
comment on column miclub.enrollments.raw_fee_amount_text is
  'Valor original de cuota recibido desde la hoja antes de parsear/normalizar.';
comment on column miclub.enrollments.raw_fee_amount is
  'Valor numerico parseado desde raw_fee_amount_text antes de normalizar escala.';
comment on column miclub.enrollments.normalized_fee_amount is
  'Cuota unitaria normalizada que debe usarse para calcular cuotas a cobrar.';
comment on column miclub.enrollments.fee_normalization_reason is
  'Razon de la normalizacion aplicada a raw_fee_amount.';
comment on column miclub.enrollments.fee_normalized_at is
  'Fecha/hora en que se calculo normalized_fee_amount.';


create table if not exists miclub.enrollment_fee_audit (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid references miclub.import_batches(id) on delete set null,
  enrollment_id uuid references miclub.enrollments(id) on delete cascade,
  source_sheet text not null,
  source_row_number integer not null,
  raw_fee_text text,
  parsed_fee_amount numeric(14,2),
  normalized_fee_amount numeric(14,2) not null default 0,
  normalization_factor numeric(14,6),
  normalization_reason text not null,
  commission_rate numeric(8,6) not null default 0,
  receivable_fee numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists enrollment_fee_audit_import_batch_id_idx on miclub.enrollment_fee_audit (import_batch_id);
create index if not exists enrollment_fee_audit_enrollment_id_idx on miclub.enrollment_fee_audit (enrollment_id);
create index if not exists enrollment_fee_audit_source_sheet_idx on miclub.enrollment_fee_audit (source_sheet);
create index if not exists enrollment_fee_audit_created_at_idx on miclub.enrollment_fee_audit (created_at desc);

comment on table miclub.enrollment_fee_audit is
  'Auditoria por importacion de la normalizacion de cuotas y calculo de comision/cuenta a cobrar.';

update miclub.enrollments
set raw_fee_amount = coalesce(raw_fee_amount, fee_amount),
    normalized_fee_amount = coalesce(
      normalized_fee_amount,
      miclub.normalize_enrollment_fee_amount(coalesce(raw_fee_amount, fee_amount)::numeric)
    ),
    fee_normalization_reason = coalesce(
      fee_normalization_reason,
      case
        when coalesce(raw_fee_amount, fee_amount) <> miclub.normalize_enrollment_fee_amount(coalesce(raw_fee_amount, fee_amount)::numeric) then 'historical_scale_adjustment'
        else 'unchanged'
      end
    ),
    fee_normalized_at = coalesce(fee_normalized_at, now())
where normalized_fee_amount is null
   or raw_fee_amount is null
   or fee_normalization_reason is null
   or fee_normalized_at is null;

create or replace view miclub.v_enrollment_receivable_fees as
select
  e.id as enrollment_id,
  eos.effective_status as status,
  eos.due_date,
  e.fee_amount,
  normalized_fee.normalized_fee_amount,
  s.name as sector_name,
  a.name as activity_name,
  commission.commission_rate,
  case
    when normalized_fee.normalized_fee_amount <= 0
      or eos.effective_status in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)
      then 0::numeric
    else normalized_fee.normalized_fee_amount * commission.commission_rate
  end as receivable_fee
from miclub.enrollments e
join miclub.v_enrollment_operational_status eos on eos.enrollment_id = e.id
join miclub.activities a on a.id = e.activity_id
join miclub.sectors s on s.id = a.sector_id
cross join lateral (
  select coalesce(
    e.normalized_fee_amount,
    miclub.normalize_enrollment_fee_amount(e.fee_amount::numeric)
  ) as normalized_fee_amount
) normalized_fee
cross join lateral (
  select case
    when normalized_fee.normalized_fee_amount <= 0
      or eos.effective_status in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)
      then 0::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('FITNESS', 'ESPACIO_FITNESS') then 0.5::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('SALON', 'SALON_DE_EVENTOS') then 0::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA' then
      greatest(0::numeric, least(1::numeric, case when coalesce(a.club_commission_percent, 0) > 1 then coalesce(a.club_commission_percent, 0) / 100 else coalesce(a.club_commission_percent, 0) end))
    else 0::numeric
  end as commission_rate
) commission;

commit;
