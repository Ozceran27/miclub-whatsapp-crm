-- Ejecutar y conservar el resultado antes de desplegar 202608130001_version_activity_terms.sql.
-- Toda fila MANUAL_REVIEW exige una decisión humana antes de crear sus términos.
SELECT a.club_id, a.id AS activity_id, a.name, a.settlement_mode,
       a.settlement_fixed_amount, a.club_commission_percent,
       CASE
         WHEN lower(coalesce(a.settlement_mode,'')) = 'fixed' AND a.settlement_fixed_amount >= 0 THEN 'READY_FIXED'
         WHEN lower(coalesce(a.settlement_mode,'')) IN ('percent','percentage','variable')
              AND a.club_commission_percent BETWEEN 0 AND 100 THEN 'READY_VARIABLE'
         ELSE 'MANUAL_REVIEW'
       END AS decision
FROM miclub.activities a
ORDER BY a.club_id, a.name, a.id;
