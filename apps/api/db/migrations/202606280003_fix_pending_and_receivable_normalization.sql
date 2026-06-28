-- Corrige métricas operativas críticas del dashboard:
-- 1) Saldos pendientes: se toman de filas importadas desde la hoja ADMINISTRACIÓN,
--    no del sector operativo del movimiento (FITNESS, AULA, etc.).
-- 2) Cuotas a cobrar: normaliza importes históricos inflados por mil antes de aplicar comisiones.

begin;

create or replace view miclub.v_admin_pending_movements as
select *
from miclub.v_movements_enriched
where coalesce(source_payload->>'sheet', '') = 'ADMINISTRACIÓN'
  and (
    operational_status = 'PENDIENTE'::miclub.movement_status
    or financial_status = 'pendiente'::miclub.financial_status
  );

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
    when abs(e.fee_amount) >= 1000000 and mod(e.fee_amount, 1000) = 0 then e.fee_amount / 1000
    else e.fee_amount
  end as normalized_fee_amount
) normalized_fee;

create or replace view miclub.v_dashboard_basic as
with real_balances as (select * from miclub.v_admin_real_balances),
pending as (
  select
    coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
    coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses
  from miclub.v_admin_pending_movements
), receivables as (
  select
    coalesce(sum(receivable_fee) filter (where status = 'adeudando'), 0) as cuotas_a_cobrar,
    coalesce(sum(receivable_fee) filter (where status = 'adeudando'), 0) as cuotas_adeudadas,
    coalesce(sum(receivable_fee) filter (where status = 'al_dia' and due_date between current_date and (date_trunc('month', current_date)::date + interval '1 month - 1 day')::date), 0) as future_receivable_fees_until_month_end
  from miclub.v_enrollment_receivable_fees
), settlements as (
  select coalesce(sum(greatest(settlement_balance, 0)), 0) as saldos_a_pagar
  from miclub.v_sector_settlement_balances
)
select
  (select count(*) from miclub.people) as total_people,
  (select count(*) from miclub.enrollments where status <> all (array['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) as active_enrollments,
  (select count(*) from miclub.enrollments where status = 'adeudando'::miclub.enrollment_status) as debtor_enrollments,
  r.cuotas_a_cobrar + r.future_receivable_fees_until_month_end as receivables_total,
  (select coalesce(sum(amount), 0) from miclub.v_admin_completed_movements where movement_type = 'INGRESOS') as total_income,
  (select coalesce(sum(amount), 0) from miclub.v_admin_completed_movements where movement_type = 'EGRESOS') as total_expense,
  p.pending_income,
  p.pending_expenses,
  p.pending_income - p.pending_expenses + r.future_receivable_fees_until_month_end as pending_net_balance,
  b.liquidity,
  b.cash,
  b.bank,
  b.dollars,
  r.cuotas_adeudadas,
  r.cuotas_a_cobrar,
  r.future_receivable_fees_until_month_end,
  b.liquidity + r.cuotas_a_cobrar + (p.pending_income - p.pending_expenses + r.future_receivable_fees_until_month_end) - s.saldos_a_pagar as projected_balance,
  s.saldos_a_pagar
from real_balances b cross join pending p cross join receivables r cross join settlements s;

commit;
