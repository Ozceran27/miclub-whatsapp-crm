-- Recalcula Cuotas a cobrar desde cuotas unitarias normalizadas y comisiones reales.
-- Regla: Adeudando solamente; FITNESS 50%, SALON 0%, AULA según comisión de la actividad.

begin;

create or replace function miclub.normalize_membership_fee_amount(value numeric)
returns numeric
language sql
immutable
as $$
  with recursive normalized(fee) as (
    select coalesce(value, 0::numeric)
    union all
    select fee / 10
    from normalized
    where abs(fee) > 100000
      and mod(fee, 10) = 0
  )
  select fee
  from normalized
  order by abs(fee) asc
  limit 1
$$;

update miclub.enrollments
set fee_amount = miclub.normalize_membership_fee_amount(fee_amount),
    updated_at = now()
where source = 'google_sheets'
  and fee_amount <> miclub.normalize_membership_fee_amount(fee_amount);

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
  select miclub.normalize_membership_fee_amount(e.fee_amount) as normalized_fee_amount
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
