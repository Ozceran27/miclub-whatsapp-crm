BEGIN;

-- Una fila por liquidación y término histórico. Los importes nunca se deducen de
-- etiquetas: actividad, club, término y asignaciones son relaciones explícitas.
CREATE OR REPLACE VIEW miclub.v_activity_settlement_balances AS
SELECT
  settlement.id AS settlement_id,
  settlement.club_id,
  settlement.activity_id,
  activity.sector_id,
  settlement.activity_term_id,
  settlement.period_from,
  settlement.period_to,
  term.mode,
  income.completed_income,
  CASE term.mode
    WHEN 'VARIABLE' THEN round(income.completed_income * (100 - term.club_share_percentage) / 100, 2)
    WHEN 'FIXED' THEN round(income.completed_income - term.monthly_fixed_fee *
      ((extract(year FROM age(settlement.period_to, settlement.period_from)) * 12
        + extract(month FROM age(settlement.period_to, settlement.period_from))) + 1), 2)
  END AS responsible_gross,
  allocation.completed_allocations,
  CASE term.mode
    WHEN 'VARIABLE' THEN round(income.completed_income * (100 - term.club_share_percentage) / 100
      - allocation.completed_allocations, 2)
    WHEN 'FIXED' THEN round(income.completed_income - term.monthly_fixed_fee *
      ((extract(year FROM age(settlement.period_to, settlement.period_from)) * 12
        + extract(month FROM age(settlement.period_to, settlement.period_from))) + 1)
      - allocation.completed_allocations, 2)
  END AS settlement_balance
FROM miclub.activity_settlements settlement
JOIN miclub.activity_terms term
  ON term.id = settlement.activity_term_id
 AND term.activity_id = settlement.activity_id
 AND term.club_id = settlement.club_id
JOIN miclub.activities activity
  ON activity.id = settlement.activity_id AND activity.club_id = settlement.club_id
LEFT JOIN LATERAL (
  SELECT coalesce(sum(abs(movement.amount)), 0)::numeric AS completed_income
  FROM miclub.movements movement
  WHERE movement.club_id = settlement.club_id
    AND movement.activity_id = settlement.activity_id
    AND movement.movement_type = 'INGRESOS'
    AND movement.operational_status::text IN ('COMPLETADO', 'COMPLETED')
    AND movement.voided_at IS NULL
    AND (movement.movement_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      BETWEEN settlement.period_from AND settlement.period_to
) income ON true
LEFT JOIN LATERAL (
  SELECT coalesce(sum(allocation.amount), 0)::numeric AS completed_allocations
  FROM miclub.activity_settlement_allocations allocation
  LEFT JOIN miclub.movements movement
    ON movement.id = allocation.movement_id AND movement.club_id = allocation.club_id
  WHERE allocation.settlement_id = settlement.id
    AND allocation.club_id = settlement.club_id
    AND allocation.status = 'COMPLETADO'
    AND allocation.voided_at IS NULL
    AND (allocation.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      BETWEEN settlement.period_from AND settlement.period_to
    AND (allocation.movement_id IS NULL OR (
      movement.activity_id = settlement.activity_id
      AND movement.operational_status::text IN ('COMPLETADO', 'COMPLETED')
      AND movement.voided_at IS NULL
    ))
) allocation ON true
WHERE settlement.status = 'COMPLETADO'
  AND settlement.voided_at IS NULL
  AND settlement.period_from BETWEEN term.effective_from AND coalesce(term.effective_to, 'infinity'::date)
  AND settlement.period_to BETWEEN term.effective_from AND coalesce(term.effective_to, 'infinity'::date)
  -- FIXED es una contraprestación mensual completa: no se prorratea.
  AND (term.mode <> 'FIXED' OR (
    extract(day FROM settlement.period_from) = 1
    AND settlement.period_to = (date_trunc('month', settlement.period_to) + interval '1 month - 1 day')::date
  ));

CREATE OR REPLACE VIEW miclub.v_activity_settlement_sector_balances AS
SELECT
  sector.id AS sector_id,
  sector.code AS sector_code,
  sector.name AS sector_name,
  sector.club_id,
  coalesce(sum(balance.settlement_balance), 0)::numeric AS settlement_balance
FROM miclub.sectors sector
LEFT JOIN miclub.v_activity_settlement_balances balance
  ON balance.sector_id = sector.id AND balance.club_id = sector.club_id
GROUP BY sector.club_id, sector.id, sector.code, sector.name;

-- Compatibilidad para reportes SQL externos. Los consumidores de aplicación usan
-- directamente la vista canónica anterior.
CREATE OR REPLACE VIEW miclub.v_sector_settlement_balances AS
SELECT sector_id, sector_code, sector_name, settlement_balance, club_id
FROM miclub.v_activity_settlement_sector_balances;

COMMENT ON VIEW miclub.v_activity_settlement_balances IS
  'Liquidaciones canónicas por actividad, período y término histórico; sólo completadas, no anuladas y con pagos explícitamente asignados.';
COMMENT ON VIEW miclub.v_activity_settlement_sector_balances IS
  'Saldos canónicos agregados exclusivamente por sector_id y club_id.';

GRANT SELECT ON miclub.v_activity_settlement_balances,
  miclub.v_activity_settlement_sector_balances TO miclub_runtime, miclub_admin;

COMMIT;
