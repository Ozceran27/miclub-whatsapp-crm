-- Align dashboard aggregates with the closed miclub.movement_status enum.
-- Ordinary metrics only consume COMPLETADO. Saldos Pendientes is the explicit
-- exception and only consumes ADMINISTRACIÓN rows in operational PENDIENTE;
-- financial_status is metadata and cannot revive a completed/canceled row.
BEGIN;

CREATE OR REPLACE VIEW miclub.v_dashboard_basic AS
SELECT c.id AS club_id,
       coalesce(m.total_income, 0) AS total_income,
       coalesce(m.total_expense, 0) AS total_expense,
       coalesce(m.total_income, 0) - coalesce(m.total_expense, 0) AS balance,
       coalesce(m.liquidity, 0) AS liquidity,
       coalesce(m.liquidity, 0) AS cash, 0::numeric AS bank, 0::numeric AS dollars,
       coalesce(m.profitability, 0) AS profitability,
       coalesce(m.pending_income, 0) AS pending_income,
       coalesce(m.pending_expenses, 0) AS pending_expenses,
       coalesce(m.pending_income, 0) - coalesce(m.pending_expenses, 0) AS pending_net_balance,
       coalesce(e.active_enrollments, 0) AS active_enrollments,
       coalesce(e.debtor_enrollments, 0) AS debtor_enrollments,
       coalesce(r.receivables_total, 0) AS receivables_total,
       coalesce(s.saldos_a_pagar, 0) AS saldos_a_pagar,
       coalesce(e.cuotas_adeudadas, 0) AS cuotas_a_cobrar,
       coalesce(e.cuotas_adeudadas, 0) AS cuotas_adeudadas,
       coalesce(m.liquidity, 0) + coalesce(r.receivables_total, 0)
         - coalesce(s.saldos_a_pagar, 0)
         + coalesce(m.pending_income, 0) - coalesce(m.pending_expenses, 0) AS projected_balance,
       0::numeric AS future_receivable_fees_until_month_end, now() AS updated_at
FROM miclub.clubs c
LEFT JOIN LATERAL (
  SELECT
    sum(amount) FILTER (WHERE movement_type='INGRESOS' AND operational_status='COMPLETADO') total_income,
    sum(amount) FILTER (WHERE movement_type='EGRESOS' AND operational_status='COMPLETADO') total_expense,
    sum(CASE WHEN operational_status='COMPLETADO' AND movement_type='INGRESOS' THEN amount WHEN operational_status='COMPLETADO' AND movement_type='EGRESOS' THEN -amount ELSE 0 END) liquidity,
    sum(CASE WHEN operational_status='COMPLETADO' AND financial_status<>'a_liquidar' AND movement_type='INGRESOS' THEN amount WHEN operational_status='COMPLETADO' AND financial_status<>'a_liquidar' AND movement_type='EGRESOS' THEN -amount ELSE 0 END) profitability,
    sum(amount) FILTER (WHERE movement_type='INGRESOS' AND operational_status='PENDIENTE' AND source_payload->>'sheet'='ADMINISTRACIÓN') pending_income,
    sum(amount) FILTER (WHERE movement_type='EGRESOS' AND operational_status='PENDIENTE' AND source_payload->>'sheet'='ADMINISTRACIÓN') pending_expenses
  FROM miclub.movements
  WHERE club_id=c.id
) m ON true
LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE status NOT IN ('abandonado','cancelado')) active_enrollments, count(*) FILTER (WHERE status='adeudando') debtor_enrollments, sum(fee_amount) FILTER (WHERE status='adeudando') cuotas_adeudadas FROM miclub.enrollments WHERE club_id=c.id) e ON true
LEFT JOIN LATERAL (SELECT sum(amount) FILTER (WHERE status IN ('pendiente','parcial','vencido')) receivables_total FROM miclub.receivables WHERE club_id=c.id) r ON true
LEFT JOIN LATERAL (SELECT sum(greatest(settlement_balance,0)) saldos_a_pagar FROM miclub.v_sector_finance_summary WHERE club_id=c.id) s ON true;

COMMIT;
