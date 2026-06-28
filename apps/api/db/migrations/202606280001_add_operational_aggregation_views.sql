-- PostgreSQL operational aggregation layer mirroring apps/api/src/services/googleSheets.ts.
-- Separates real administration balances, completed/pending admin movements,
-- settlement balances, profitability, and sector-specific operational metrics.

create or replace view miclub.v_admin_completed_movements as
select *
from miclub.v_movements_enriched
where replace(upper(coalesce(sector_name, '')), 'Ó', 'O') = 'ADMINISTRACION'
  and operational_status = 'COMPLETADO'::miclub.movement_status;

create or replace view miclub.v_admin_pending_movements as
select *
from miclub.v_movements_enriched
where replace(upper(coalesce(sector_name, '')), 'Ó', 'O') = 'ADMINISTRACION'
  and operational_status = 'PENDIENTE'::miclub.movement_status;

create or replace view miclub.v_admin_real_balances as
select
  coalesce(ob.liquidity, 0) as liquidity,
  coalesce(ob.cash, 0) as cash,
  coalesce(ob.bank, 0) as bank,
  coalesce(ob.dollars, 0) as dollars
from (select 1) base
left join lateral (
  select liquidity, cash, bank, dollars
  from miclub.operational_balances
  order by cutoff_date desc, created_at desc
  limit 1
) ob on true;

create or replace view miclub.v_sector_settlement_balances as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  case
    when upper(replace(s.name, ' ', '_')) in ('FITNESS', 'LOCAL_1') then coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0)
    else 0::numeric
  end as settlement_balance
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
group by s.id, s.code, s.name;

create or replace view miclub.v_module_total_profitability as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as total_profitability
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
group by s.id, s.code, s.name;

create or replace view miclub.v_module_current_month_profitability as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when date_trunc('month', m.movement_date) = date_trunc('month', now()) and m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when date_trunc('month', m.movement_date) = date_trunc('month', now()) and m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as current_month_profitability
from miclub.sectors s
left join miclub.movements m on m.sector_id = s.id
group by s.id, s.code, s.name;

create or replace view miclub.v_local1_special_metrics as
with relevant as (
  select *
  from miclub.v_movements_enriched
  where upper(replace(coalesce(sector_name, ''), ' ', '_')) = 'LOCAL_1'
    and movement_type = 'INGRESOS'::miclub.movement_type
    and (upper(coalesce(category, '')) in ('COMISIÓN', 'COMISION', 'VENTAS'))
), highlighted as (
  select amount, coalesce(nullif(concept, ''), category) as concept, movement_date
  from relevant
  order by amount desc, movement_date desc
  limit 1
)
select
  (select count(*) from relevant)::integer as total_relevant_income_movements,
  (select count(*) from relevant where movement_date >= now() - interval '30 days')::integer as last30days_relevant_income_movements,
  (select amount from highlighted) as highlighted_income_amount,
  (select concept from highlighted) as highlighted_income_concept,
  (select movement_date from highlighted) as highlighted_income_date;

create or replace view miclub.v_cantina_special_metrics as
select
  coalesce(sum(case when movement_type = 'INGRESOS' and upper(coalesce(category, '')) = 'KIOSCO' then amount else 0 end), 0) as kiosk_income,
  coalesce(sum(case when movement_type = 'INGRESOS' and upper(coalesce(category, '')) = 'BEBIDAS' then amount else 0 end), 0) as drinks_income,
  coalesce(sum(case when movement_type = 'EGRESOS' and upper(coalesce(category, '')) = 'BEBIDAS' then amount else 0 end), 0) as cmv,
  coalesce(sum(case when movement_type = 'INGRESOS' and upper(coalesce(category, '')) in ('KIOSCO', 'BEBIDAS') then amount when movement_type = 'EGRESOS' and upper(coalesce(category, '')) = 'BEBIDAS' then -amount else 0 end), 0) as total_profitability
from miclub.v_movements_enriched
where upper(coalesce(sector_name, '')) = 'CANTINA';

create or replace view miclub.v_enrollment_receivable_fees as
select
  e.id as enrollment_id,
  e.status,
  e.due_date,
  e.fee_amount,
  s.name as sector_name,
  a.name as activity_name,
  case
    when upper(coalesce(s.name, '')) = 'FITNESS' then 0.5
    when upper(coalesce(s.name, '')) = 'SALON' then 0
    when upper(coalesce(s.name, '')) = 'AULA' then case when coalesce(a.club_commission_percent, 0) > 1 then a.club_commission_percent / 100 else coalesce(a.club_commission_percent, 0) end
    else 0
  end as commission_rate,
  e.fee_amount * case
    when upper(coalesce(s.name, '')) = 'FITNESS' then 0.5
    when upper(coalesce(s.name, '')) = 'SALON' then 0
    when upper(coalesce(s.name, '')) = 'AULA' then case when coalesce(a.club_commission_percent, 0) > 1 then a.club_commission_percent / 100 else coalesce(a.club_commission_percent, 0) end
    else 0
  end as receivable_fee
from miclub.enrollments e
join miclub.activities a on a.id = e.activity_id
join miclub.sectors s on s.id = a.sector_id;

create or replace view miclub.v_sector_finance_summary as
select
  s.id as sector_id,
  s.code as sector_code,
  s.name as sector_name,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as total_income,
  coalesce(sum(case when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then m.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when m.movement_type = 'INGRESOS' and m.operational_status = 'COMPLETADO' then m.amount when m.movement_type = 'EGRESOS' and m.operational_status = 'COMPLETADO' then -m.amount else 0 end), 0) as balance,
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
), settlements as (select coalesce(sum(settlement_balance), 0) as saldos_a_pagar from miclub.v_sector_settlement_balances)
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
