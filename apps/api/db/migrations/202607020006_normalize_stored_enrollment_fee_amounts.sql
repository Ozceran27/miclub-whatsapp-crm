-- Normaliza en origen las cuotas unitarias importadas desde Google Sheets.
-- La aplicación no debe depender de que la UI o el saldo proyectado corrijan
-- importes agregados ya inflados: enrollments.fee_amount debe quedar en ARS reales.

begin;

update miclub.enrollments
set fee_amount = case
    when abs(fee_amount) >= 100000000 and mod(fee_amount, 1000) = 0 then fee_amount / 1000
    when abs(fee_amount) >= 1000000 and abs(fee_amount) < 10000000 and mod(fee_amount, 10) = 0 then fee_amount / 10
    else fee_amount
  end,
  updated_at = now()
where source = 'google_sheets'
  and (
    (abs(fee_amount) >= 100000000 and mod(fee_amount, 1000) = 0)
    or (abs(fee_amount) >= 1000000 and abs(fee_amount) < 10000000 and mod(fee_amount, 10) = 0)
  );

create or replace view miclub.v_enrollment_receivable_fees as
select
  e.id as enrollment_id,
  eos.effective_status as status,
  eos.due_date,
  e.fee_amount,
  normalized_fee.normalized_fee_amount,
  s.name as sector_name,
  a.name as activity_name,
  case
    when normalized_fee.normalized_fee_amount <= 0
      or eos.effective_status in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)
      then 0::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('FITNESS', 'ESPACIO_FITNESS') then 0.5::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('SALON', 'SALON_DE_EVENTOS') then 0::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA' then
      greatest(0::numeric, least(1::numeric, case when coalesce(a.club_commission_percent, 0) > 1 then coalesce(a.club_commission_percent, 0) / 100 else coalesce(a.club_commission_percent, 0) end))
    else 0::numeric
  end as commission_rate,
  case
    when normalized_fee.normalized_fee_amount <= 0
      or eos.effective_status in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)
      then 0::numeric
    else normalized_fee.normalized_fee_amount * case
      when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('FITNESS', 'ESPACIO_FITNESS') then 0.5::numeric
      when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('SALON', 'SALON_DE_EVENTOS') then 0::numeric
      when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA' then
        greatest(0::numeric, least(1::numeric, case when coalesce(a.club_commission_percent, 0) > 1 then coalesce(a.club_commission_percent, 0) / 100 else coalesce(a.club_commission_percent, 0) end))
      else 0::numeric
    end
  end as receivable_fee
from miclub.enrollments e
join miclub.v_enrollment_operational_status eos on eos.enrollment_id = e.id
join miclub.activities a on a.id = e.activity_id
join miclub.sectors s on s.id = a.sector_id
cross join lateral (
  select case
    when abs(e.fee_amount) >= 100000000 and mod(e.fee_amount, 1000) = 0 then e.fee_amount / 1000
    when abs(e.fee_amount) >= 1000000 and abs(e.fee_amount) < 10000000 and mod(e.fee_amount, 10) = 0 then e.fee_amount / 10
    else e.fee_amount
  end as normalized_fee_amount
) normalized_fee;

commit;
