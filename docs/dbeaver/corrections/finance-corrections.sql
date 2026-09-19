-- Correcciones manuales de importación financiera miClub (PostgreSQL)
-- Ejecutar desde DBeaver en la base productiva, idealmente luego de un backup.
-- Objetivo:
-- 1) Normalizar importes migrados 100x cuando Google Sheets/Excel entregó centavos como enteros.
-- 2) Asegurar que la vista de tablero exponga saldos operativos con la misma fórmula de la planilla.

begin;

-- 1) Diagnóstico rápido: estos SELECT deben mostrar el estado antes de tocar datos.
select 'operational_balances_latest' as check_name, cutoff_date, liquidity, cash, bank, dollars, source, source_payload
from miclub.operational_balances
order by cutoff_date desc, created_at desc
limit 5;

select 'movement_scale_sample' as check_name,
       count(*) as movements,
       min(amount) as min_amount,
       percentile_cont(0.5) within group (order by amount) as median_amount,
       max(amount) as max_amount
from miclub.movements;

-- 2) Normalización guardada contra doble ejecución.
-- Divide por 100 únicamente filas que todavía tienen valores claramente inflados.
-- Si un balance ya fue corregido (por ejemplo caja cercana a 1.700.280), no vuelve a tocarse.
update miclub.operational_balances
set liquidity = liquidity / 100,
    cash = cash / 100,
    bank = bank / 100,
    amount = amount / 100,
    updated_at = now(),
    source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('manual_scale_fix', 'divided_by_100', 'manual_scale_fix_at', now())
where source in ('google_sheets', 'manual_dbeaver')
  and greatest(abs(liquidity), abs(cash), abs(bank), abs(amount)) >= 10000000
  and coalesce(source_payload ->> 'manual_scale_fix', '') <> 'divided_by_100';

-- Dólares no se dividen si el valor ya parece una cantidad nominal (ej. 100 o 10000).
update miclub.operational_balances
set dollars = dollars / 100,
    updated_at = now(),
    source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('manual_usd_scale_fix', 'divided_by_100', 'manual_usd_scale_fix_at', now())
where source in ('google_sheets', 'manual_dbeaver')
  and abs(dollars) >= 1000000
  and coalesce(source_payload ->> 'manual_usd_scale_fix', '') <> 'divided_by_100';

update miclub.movements
set amount = amount / 100,
    taxes = taxes / 100,
    source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('manual_scale_fix', 'divided_by_100', 'manual_scale_fix_at', now())
where source = 'google_sheets'
  and greatest(abs(amount), abs(taxes)) >= 10000000
  and coalesce(source_payload ->> 'manual_scale_fix', '') <> 'divided_by_100';

update miclub.receivables
set amount = amount / 100,
    club_amount = club_amount / 100
where greatest(abs(amount), abs(club_amount)) >= 10000000;

update miclub.payments
set amount = amount / 100
where abs(amount) >= 10000000;

update miclub.payment_allocations
set amount = amount / 100
where abs(amount) >= 10000000;

-- 3) Recalcular/asegurar fórmula de saldos operativos usada por INICIO.
-- Equivale a la planilla documentada:
-- saldoProyectado = liquidez + cuotasACobrar + saldoPendienteNeto - saldosAPagar
create or replace view miclub.v_dashboard_basic as
with real_balances as (
  select liquidity, cash, bank, dollars from miclub.v_admin_real_balances
), pending as (
  select
    coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
    coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses
  from miclub.v_admin_pending_movements
), receivables as (
  select
    coalesce(sum(receivable_fee) filter (where status = 'adeudando'::miclub.enrollment_status), 0) as cuotas_a_cobrar,
    coalesce(sum(receivable_fee) filter (where status = 'adeudando'::miclub.enrollment_status), 0) as cuotas_adeudadas,
    coalesce(sum(receivable_fee) filter (
      where status = 'al_dia'::miclub.enrollment_status
        and due_date >= current_date
        and due_date <= (date_trunc('month', current_date)::date + interval '1 month - 1 day')::date
    ), 0) as future_receivable_fees_until_month_end
  from miclub.v_enrollment_receivable_fees
), settlements as (
  select coalesce(sum(greatest(settlement_balance, 0)), 0) as saldos_a_pagar
  from miclub.v_sector_settlement_balances
)
select
  (select count(*) from miclub.people) as total_people,
  (select count(*) from miclub.enrollments where status <> all(array['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) as active_enrollments,
  (select count(*) from miclub.enrollments where status = 'adeudando'::miclub.enrollment_status) as debtor_enrollments,
  (r.cuotas_a_cobrar + r.future_receivable_fees_until_month_end) as receivables_total,
  (select coalesce(sum(amount), 0) from miclub.v_admin_completed_movements where movement_type = 'INGRESOS'::miclub.movement_type) as total_income,
  (select coalesce(sum(amount), 0) from miclub.v_admin_completed_movements where movement_type = 'EGRESOS'::miclub.movement_type) as total_expense,
  p.pending_income,
  p.pending_expenses,
  ((p.pending_income - p.pending_expenses) + r.future_receivable_fees_until_month_end) as pending_net_balance,
  b.liquidity,
  b.cash,
  b.bank,
  b.dollars,
  r.cuotas_adeudadas,
  r.cuotas_a_cobrar,
  r.future_receivable_fees_until_month_end,
  (((b.liquidity + r.cuotas_a_cobrar) + ((p.pending_income - p.pending_expenses) + r.future_receivable_fees_until_month_end)) - s.saldos_a_pagar) as projected_balance,
  s.saldos_a_pagar
from real_balances b
cross join pending p
cross join receivables r
cross join settlements s;

-- 4) Validación posterior.
select 'dashboard_after_fix' as check_name, liquidity, cash, bank, dollars, cuotas_a_cobrar, pending_net_balance, saldos_a_pagar, projected_balance
from miclub.v_dashboard_basic;

commit;
