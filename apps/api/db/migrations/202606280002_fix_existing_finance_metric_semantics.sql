-- Manual patch for already-created databases.
-- Apply this full script in DBeaver after 202606280001_add_operational_aggregation_views.sql.
-- It keeps the existing public view contracts but separates:
--   * balance: completed operational net by sector
--   * total_profitability: completed profitability excluding amounts still pending settlement
--   * settlement_balance: pending liquidable balance only where the sheet defines one (FITNESS!X3 / LOCAL 1!X3)

begin;

create or replace view miclub.v_sector_settlement_balances as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  case
    when upper(replace(s.name, ' ', '_')) in ('FITNESS', 'LOCAL_1') then coalesce(sum(case when m.financial_status = 'a_liquidar' and m.movement_type = 'INGRESOS' then m.amount when m.financial_status = 'a_liquidar' and m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0)
    else null::numeric
  end as settlement_balance
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
group by s.id, s.code, s.name;

create or replace view miclub.v_admin_real_balances as
with latest_balance as (
  select
    source_payload,
    case
      when source_payload->>'fx' ~ '^-?[0-9]+([\.,][0-9]+)?$' then replace(source_payload->>'fx', ',', '.')::numeric
      when source_payload->'rows'->2->>2 ~ '^-?[0-9]+([\.,][0-9]+)?$' then replace(source_payload->'rows'->2->>2, ',', '.')::numeric
      else 0::numeric
    end as fx
  from miclub.operational_balances
  order by cutoff_date desc, created_at desc
  limit 1
), admin_totals as (
  select
    coalesce(sum(case when movement_type in ('INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type) and lower(coalesce(payment_method, '')) = 'efectivo' then amount when movement_type = 'EGRESOS'::miclub.movement_type and lower(coalesce(payment_method, '')) = 'efectivo' then -amount else 0 end), 0) as cash,
    coalesce(sum(case when movement_type in ('INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type) and lower(coalesce(payment_method, '')) = 'transferencia' then amount when movement_type = 'EGRESOS'::miclub.movement_type and lower(coalesce(payment_method, '')) = 'transferencia' then -amount else 0 end), 0) as bank,
    coalesce(sum(case when movement_type in ('INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type) and replace(upper(coalesce(category, '')), 'Ó', 'O') = 'DOLARES' then amount when movement_type = 'EGRESOS'::miclub.movement_type and replace(upper(coalesce(category, '')), 'Ó', 'O') = 'DOLARES' then -amount else 0 end), 0) as dollars,
    coalesce(sum(case when movement_type = 'CAPITAL'::miclub.movement_type then amount else 0 end), 0) as capital,
    coalesce(sum(case when movement_type = 'CAPITAL'::miclub.movement_type and replace(upper(coalesce(category, '')), 'Ó', 'O') = 'DOLARES' then amount else 0 end), 0) as capital_dollars
  from miclub.v_admin_completed_movements
), settlements as (
  select coalesce(sum(greatest(settlement_balance, 0)), 0) as sector_settlement_balance
  from miclub.v_sector_settlement_balances
)
select
  a.capital - a.capital_dollars + s.sector_settlement_balance + (a.dollars * coalesce(lb.fx, 0)) as liquidity,
  a.cash,
  a.bank,
  a.dollars
from admin_totals a
cross join settlements s
left join latest_balance lb on true;

create or replace view miclub.v_module_total_profitability as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when m.operational_status = 'COMPLETADO' and m.financial_status <> 'a_liquidar' and m.movement_type = 'INGRESOS' then m.amount when m.operational_status = 'COMPLETADO' and m.financial_status <> 'a_liquidar' and m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as total_profitability
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
group by s.id, s.code, s.name;

create or replace view miclub.v_sector_finance_summary as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as total_income,
  coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when m.operational_status = 'COMPLETADO' and m.movement_type = 'INGRESOS' then m.amount when m.operational_status = 'COMPLETADO' and m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as balance,
  ssb.settlement_balance,
  mtp.total_profitability,
  mmp.current_month_profitability
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
left join miclub.v_sector_settlement_balances ssb on ssb.sector_id = s.id
left join miclub.v_module_total_profitability mtp on mtp.sector_id = s.id
left join miclub.v_module_current_month_profitability mmp on mmp.sector_id = s.id
group by s.id, s.code, s.name, ssb.settlement_balance, mtp.total_profitability, mmp.current_month_profitability;

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
