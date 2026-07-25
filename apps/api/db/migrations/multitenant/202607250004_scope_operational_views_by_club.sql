-- Phase 2 multitenant migration: make backend-facing operational views tenant-addressable.
-- Every aggregate is partitioned by club_id so API queries can safely apply `where club_id = $1`.
BEGIN;

-- Phase A: row-level projection. club_id is appended to preserve the existing column contract.
CREATE OR REPLACE VIEW miclub.v_movements_enriched AS
SELECT m.id, m.external_id, m.movement_date, m.movement_type, c.name AS category,
       s.code AS sector_code, s.name AS sector_name, m.concept, p.first_name, p.last_name,
       p.dni, m.counterparty_text, m.amount, m.taxes, pm.name AS payment_method,
       m.financial_status, m.operational_status, m.source, m.created_at, m.category_id,
       m.sector_id, m.counterparty_person_id AS person_id, m.payment_method_id,
       m.source_payload, m.updated_at, m.club_id
FROM miclub.movements m
LEFT JOIN miclub.movement_categories c ON c.id = m.category_id AND c.club_id = m.club_id
LEFT JOIN miclub.sectors s ON s.id = m.sector_id AND s.club_id = m.club_id
LEFT JOIN miclub.people p ON p.id = m.counterparty_person_id AND p.club_id = m.club_id
LEFT JOIN miclub.payment_methods pm ON pm.id = m.payment_method_id AND pm.club_id = m.club_id;

-- Phase B: sector aggregates. Both joins and grouping retain the tenant boundary.
CREATE OR REPLACE VIEW miclub.v_sector_finance_summary AS
SELECT s.id AS sector_id, s.code AS sector_code, s.name AS sector_name,
       coalesce(sum(m.amount) FILTER (WHERE m.movement_type = 'INGRESOS' AND m.operational_status = 'COMPLETADO'), 0) AS total_income,
       coalesce(sum(m.amount) FILTER (WHERE m.movement_type = 'EGRESOS' AND m.operational_status = 'COMPLETADO'), 0) AS total_expense,
       coalesce(sum(CASE WHEN m.operational_status = 'COMPLETADO' AND m.movement_type = 'INGRESOS' THEN m.amount WHEN m.operational_status = 'COMPLETADO' AND m.movement_type = 'EGRESOS' THEN -m.amount ELSE 0 END), 0) AS balance,
       CASE WHEN upper(replace(s.name, ' ', '_')) IN ('FITNESS', 'LOCAL_1') THEN coalesce(sum(CASE WHEN m.financial_status = 'a_liquidar' AND m.movement_type = 'INGRESOS' THEN m.amount WHEN m.financial_status = 'a_liquidar' AND m.movement_type = 'EGRESOS' THEN -m.amount ELSE 0 END), 0) ELSE NULL::numeric END AS settlement_balance,
       coalesce(sum(CASE WHEN m.operational_status = 'COMPLETADO' AND m.financial_status <> 'a_liquidar' AND m.movement_type = 'INGRESOS' THEN m.amount WHEN m.operational_status = 'COMPLETADO' AND m.financial_status <> 'a_liquidar' AND m.movement_type = 'EGRESOS' THEN -m.amount ELSE 0 END), 0) AS total_profitability,
       coalesce(sum(CASE WHEN date_trunc('month', m.movement_date) = date_trunc('month', now()) AND m.operational_status = 'COMPLETADO' AND m.movement_type = 'INGRESOS' THEN m.amount WHEN date_trunc('month', m.movement_date) = date_trunc('month', now()) AND m.operational_status = 'COMPLETADO' AND m.movement_type = 'EGRESOS' THEN -m.amount ELSE 0 END), 0) AS current_month_profitability,
       s.club_id
FROM miclub.sectors s
LEFT JOIN miclub.movements m ON m.sector_id = s.id AND m.club_id = s.club_id
GROUP BY s.club_id, s.id, s.code, s.name;

-- Phase C: one dashboard row per club. DROP is intentional because the historical
-- definition changed column order several times and PostgreSQL cannot replace it safely.
DROP VIEW IF EXISTS miclub.v_dashboard_basic;
CREATE VIEW miclub.v_dashboard_basic AS
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
       coalesce(m.liquidity, 0) + coalesce(r.receivables_total, 0) - coalesce(s.saldos_a_pagar, 0) AS projected_balance,
       0::numeric AS future_receivable_fees_until_month_end, now() AS updated_at
FROM miclub.clubs c
LEFT JOIN LATERAL (SELECT sum(amount) FILTER (WHERE movement_type='INGRESOS' AND operational_status='COMPLETADO') total_income, sum(amount) FILTER (WHERE movement_type='EGRESOS' AND operational_status='COMPLETADO') total_expense, sum(CASE WHEN operational_status='COMPLETADO' AND movement_type='INGRESOS' THEN amount WHEN operational_status='COMPLETADO' AND movement_type='EGRESOS' THEN -amount ELSE 0 END) liquidity, sum(CASE WHEN operational_status='COMPLETADO' AND financial_status<>'a_liquidar' AND movement_type='INGRESOS' THEN amount WHEN operational_status='COMPLETADO' AND financial_status<>'a_liquidar' AND movement_type='EGRESOS' THEN -amount ELSE 0 END) profitability, sum(amount) FILTER (WHERE movement_type='INGRESOS' AND (operational_status='PENDIENTE' OR financial_status='pendiente')) pending_income, sum(amount) FILTER (WHERE movement_type='EGRESOS' AND (operational_status='PENDIENTE' OR financial_status='pendiente')) pending_expenses FROM miclub.movements WHERE club_id=c.id) m ON true
LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE status NOT IN ('abandonado','cancelado')) active_enrollments, count(*) FILTER (WHERE status='adeudando') debtor_enrollments, sum(fee_amount) FILTER (WHERE status='adeudando') cuotas_adeudadas FROM miclub.enrollments WHERE club_id=c.id) e ON true
LEFT JOIN LATERAL (SELECT sum(amount) FILTER (WHERE status IN ('pendiente','parcial','vencido')) receivables_total FROM miclub.receivables WHERE club_id=c.id) r ON true
LEFT JOIN LATERAL (SELECT sum(greatest(settlement_balance,0)) saldos_a_pagar FROM miclub.v_sector_finance_summary WHERE club_id=c.id) s ON true;

COMMIT;
