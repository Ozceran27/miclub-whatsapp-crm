-- Normaliza definitivamente las cuotas a cobrar con escalas históricas incorrectas.
-- Caso real: cuotas importadas con un cero extra ($811.000 => 8.110.000)
-- inflaban "CUOTAS A COBRAR" de $405.500 a $4.055.000.

begin;

create or replace view miclub.v_enrollment_receivable_fees as
select
  e.id as enrollment_id,
  e.status,
  e.due_date,
  e.fee_amount,
  normalized_fee.normalized_fee_amount,
  s.name as sector_name,
  a.name as activity_name,
  case
    when normalized_fee.normalized_fee_amount <= 0 or e.status in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status) then 0::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('FITNESS', 'ESPACIO_FITNESS') then 0.5::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('SALON', 'SALON_DE_EVENTOS') then 0::numeric
    when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA' then
      greatest(0::numeric, least(1::numeric, case when coalesce(a.club_commission_percent, 0) > 1 then coalesce(a.club_commission_percent, 0) / 100 else coalesce(a.club_commission_percent, 0) end))
    else 0::numeric
  end as commission_rate,
  case
    when normalized_fee.normalized_fee_amount <= 0 or e.status in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status) then 0::numeric
    else normalized_fee.normalized_fee_amount * case
      when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('FITNESS', 'ESPACIO_FITNESS') then 0.5::numeric
      when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) in ('SALON', 'SALON_DE_EVENTOS') then 0::numeric
      when upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA' then
        greatest(0::numeric, least(1::numeric, case when coalesce(a.club_commission_percent, 0) > 1 then coalesce(a.club_commission_percent, 0) / 100 else coalesce(a.club_commission_percent, 0) end))
      else 0::numeric
    end
  end as receivable_fee
from miclub.enrollments e
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
