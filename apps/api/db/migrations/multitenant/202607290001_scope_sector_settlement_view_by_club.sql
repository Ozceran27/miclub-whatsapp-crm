-- Complete the multitenant projection missed by 202607250004.
-- The dashboard can now address this view directly without mixing tenants.
BEGIN;

CREATE OR REPLACE VIEW miclub.v_sector_settlement_balances AS
SELECT
  s.id AS sector_id,
  s.code AS sector_code,
  s.name AS sector_name,
  CASE
    WHEN upper(replace(s.name, ' ', '_')) IN ('FITNESS', 'LOCAL_1') THEN
      coalesce(sum(CASE
        WHEN m.financial_status = 'a_liquidar' AND m.movement_type = 'INGRESOS' THEN m.amount
        WHEN m.financial_status = 'a_liquidar' AND m.movement_type = 'EGRESOS' THEN -m.amount
        ELSE 0
      END), 0)
    ELSE NULL::numeric
  END AS settlement_balance,
  s.club_id
FROM miclub.sectors s
LEFT JOIN miclub.movements m
  ON m.sector_id = s.id
 AND m.club_id = s.club_id
GROUP BY s.club_id, s.id, s.code, s.name;

COMMENT ON VIEW miclub.v_sector_settlement_balances IS
  'Saldos a liquidar por sector, aislados por club_id.';

COMMIT;
