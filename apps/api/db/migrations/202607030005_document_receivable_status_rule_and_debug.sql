-- Regla de negocio de Cuotas a cobrar:
--   Incluye solamente inscripciones con estado efectivo 'adeudando'.
--   No incluye 'nuevo_inscripto': ese estado identifica altas recientes sin deuda efectiva.
--   La misma definición se usa en miclub.v_dashboard_basic y en los reportes
--   derivados de miclub.v_enrollment_receivable_fees.

comment on view miclub.v_enrollment_receivable_fees is
  'Base de cuotas por inscripcion. Regla de Cuotas a cobrar: sumar receivable_fee solo cuando status/effective_status = adeudando; nuevo_inscripto no integra Cuotas a cobrar.';

create or replace view miclub.v_receivable_fees_effective_status_debug as
select
  status as effective_status,
  (count(*))::integer as enrollments_count,
  coalesce(sum(receivable_fee), 0)::numeric(14,2) as total_receivable_fee,
  coalesce(sum(normalized_fee_amount), 0)::numeric(14,2) as total_normalized_fee
from miclub.v_enrollment_receivable_fees
group by status
order by status;

comment on view miclub.v_receivable_fees_effective_status_debug is
  'Debug previo a Cuotas a cobrar: conteo y monto por estado efectivo. Cuotas a cobrar debe tomar solo effective_status=adeudando; nuevo_inscripto queda excluido.';

-- DROP is required because PostgreSQL cannot CREATE OR REPLACE a view when the
-- replacement changes existing column names/order (for example total_people -> total_income).
drop view if exists miclub.v_dashboard_basic;

create view miclub.v_dashboard_basic as
with balances as (
  select
    coalesce(sum(case when movement_type = 'INGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as total_income,
    coalesce(sum(case when movement_type = 'EGRESOS' and operational_status = 'COMPLETADO' then amount else 0 end), 0) as total_expense,
    coalesce(sum(case when operational_status = 'COMPLETADO' and movement_type = 'INGRESOS' then amount when operational_status = 'COMPLETADO' and movement_type = 'EGRESOS' then -amount else 0 end), 0) as liquidity,
    coalesce(sum(case when operational_status = 'COMPLETADO' and financial_status <> 'a_liquidar' and movement_type = 'INGRESOS' then amount when operational_status = 'COMPLETADO' and financial_status <> 'a_liquidar' and movement_type = 'EGRESOS' then -amount else 0 end), 0) as profitability
  from miclub.movements
), pending as (
  select
    coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
    coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses
  from miclub.movements
  where operational_status = 'PENDIENTE'::miclub.movement_status
     or financial_status = 'pendiente'::miclub.financial_status
), receivables as (
  select
    coalesce(sum(receivable_fee) filter (where status = 'adeudando'::miclub.enrollment_status), 0) as cuotas_a_cobrar,
    coalesce(sum(receivable_fee) filter (where status = 'adeudando'::miclub.enrollment_status), 0) as cuotas_adeudadas,
    coalesce(sum(receivable_fee) filter (where status = 'al_dia'::miclub.enrollment_status and due_date between current_date and (date_trunc('month', current_date)::date + interval '1 month - 1 day')::date), 0) as future_receivable_fees_until_month_end
  from miclub.v_enrollment_receivable_fees
), settlements as (
  select coalesce(sum(settlement_balance) filter (where settlement_balance > 0), 0) as saldos_a_pagar
  from miclub.v_sector_settlement_balances
)
select
  b.total_income,
  b.total_expense,
  b.total_income - b.total_expense as balance,
  b.liquidity,
  b.liquidity as cash,
  0::numeric as bank,
  0::numeric as dollars,
  b.profitability,
  p.pending_income,
  p.pending_expenses,
  p.pending_income - p.pending_expenses as pending_net_balance,
  (select count(*) from miclub.enrollments where status <> all (array['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) as active_enrollments,
  (select count(*) from miclub.v_enrollment_operational_status where effective_status = 'adeudando'::miclub.enrollment_status) as debtor_enrollments,
  r.cuotas_a_cobrar + r.future_receivable_fees_until_month_end as receivables_total,
  s.saldos_a_pagar,
  r.cuotas_a_cobrar,
  r.cuotas_adeudadas,
  b.liquidity + r.cuotas_a_cobrar + (p.pending_income - p.pending_expenses + r.future_receivable_fees_until_month_end) - s.saldos_a_pagar as projected_balance,
  r.future_receivable_fees_until_month_end,
  now() as updated_at
from balances b
cross join pending p
cross join receivables r
cross join settlements s;

comment on view miclub.v_dashboard_basic is
  'Dashboard financiero. Regla de Cuotas a cobrar: incluye solo status/effective_status=adeudando desde v_enrollment_receivable_fees; nuevo_inscripto queda excluido.';
