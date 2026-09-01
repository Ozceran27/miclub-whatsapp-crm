-- MANUAL / IDEMPOTENTE. Ejecutar por bloques y revisar resultados antes de validar.
-- 1. Diagnóstico: los NULL y combinaciones heredadas ambiguas requieren decisión humana.
SELECT capacity_mode, configured_capacity, count(*) FROM miclub.sectors GROUP BY 1,2 ORDER BY 1,2;
SELECT id,club_id,name,capacity_mode,configured_capacity FROM miclub.sectors
WHERE capacity_mode IS NULL OR capacity_mode NOT IN ('fixed','none','unlimited','ENROLLMENTS','INCOME')
   OR (capacity_mode='fixed' AND coalesce(configured_capacity,0)<=0)
   OR (capacity_mode IN ('none','unlimited','INCOME') AND configured_capacity IS NOT NULL);

-- 2. Sólo equivalencias inequívocas. No modificar las filas listadas arriba.
UPDATE miclub.sectors SET capacity_mode='ENROLLMENTS' WHERE capacity_mode='fixed' AND configured_capacity>0;
UPDATE miclub.sectors SET capacity_mode='INCOME',configured_capacity=NULL WHERE capacity_mode IN ('none','unlimited') AND configured_capacity IS NULL;

ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_capacity_mode_allowed_check;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_capacity_mode_capacity_consistency_check;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_configured_capacity_nonnegative_check;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_enrollment_capacity_check;
ALTER TABLE miclub.sectors DROP CONSTRAINT IF EXISTS sectors_income_capacity_check;
ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_capacity_mode_allowed_check CHECK(capacity_mode IS NULL OR capacity_mode IN ('ENROLLMENTS','INCOME')) NOT VALID;
ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_enrollment_capacity_check CHECK(capacity_mode IS DISTINCT FROM 'ENROLLMENTS' OR configured_capacity>0) NOT VALID;
ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_income_capacity_check CHECK(capacity_mode IS DISTINCT FROM 'INCOME' OR configured_capacity IS NULL) NOT VALID;

-- 3. Debe devolver cero filas antes de continuar. Resolver manualmente; no inferir.
SELECT id,club_id,name,capacity_mode,configured_capacity FROM miclub.sectors WHERE
 capacity_mode IS NULL OR (capacity_mode NOT IN ('ENROLLMENTS','INCOME')) OR
 (capacity_mode='ENROLLMENTS' AND coalesce(configured_capacity,0)<=0) OR
 (capacity_mode='INCOME' AND configured_capacity IS NOT NULL);

-- 4. Validar solamente tras resolver el diagnóstico.
ALTER TABLE miclub.sectors VALIDATE CONSTRAINT sectors_capacity_mode_allowed_check;
ALTER TABLE miclub.sectors VALIDATE CONSTRAINT sectors_enrollment_capacity_check;
ALTER TABLE miclub.sectors VALIDATE CONSTRAINT sectors_income_capacity_check;
CREATE INDEX IF NOT EXISTS sectors_club_capacity_mode_idx ON miclub.sectors(club_id,capacity_mode);
CREATE INDEX IF NOT EXISTS sectors_active_club_capacity_mode_idx ON miclub.sectors(club_id,capacity_mode) WHERE archived_at IS NULL AND status::text IN ('active','activa');
COMMENT ON COLUMN miclub.sectors.capacity_mode IS 'ENROLLMENTS: cupo por inscriptos; INCOME: récord mensual de ingresos.';
COMMENT ON COLUMN miclub.sectors.configured_capacity IS 'Entero positivo sólo para ENROLLMENTS; NULL para INCOME.';

-- 5. Verificación final.
SELECT conname,convalidated FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname LIKE 'sectors_%capacity%';
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='miclub' AND tablename='sectors' AND indexname LIKE '%capacity_mode%';
SELECT capacity_mode,count(*),min(configured_capacity),max(configured_capacity) FROM miclub.sectors GROUP BY capacity_mode ORDER BY capacity_mode;

-- 6. Vistas canónicas (idempotentes). La cotización faltante invalida el total
-- mensual completo para evitar sumar parcialmente monedas heterogéneas.
CREATE OR REPLACE VIEW miclub.v_sector_monthly_completed_income AS
SELECT m.club_id, m.sector_id,
       date_trunc('month',m.movement_date::timestamp AT TIME ZONE coalesce(nullif(c.timezone,''),'America/Argentina/Buenos_Aires'))::date AS month,
       CASE WHEN count(*) FILTER (WHERE coalesce(m.currency_code,c.base_currency_code)<>c.base_currency_code AND er.id IS NULL)>0 THEN NULL ELSE sum(CASE
         WHEN coalesce(m.currency_code,c.base_currency_code)=c.base_currency_code THEN m.amount
         WHEN er.base_currency_code=m.currency_code AND er.quote_currency_code=c.base_currency_code THEN m.amount*er.rate
         WHEN er.quote_currency_code=m.currency_code AND er.base_currency_code=c.base_currency_code THEN m.amount/er.rate END) END AS income,
       count(*) FILTER (WHERE coalesce(m.currency_code,c.base_currency_code)<>c.base_currency_code AND er.id IS NULL)::integer AS missing_exchange_rate_count
FROM miclub.movements m JOIN miclub.clubs c ON c.id=m.club_id
LEFT JOIN LATERAL (SELECT r.* FROM miclub.exchange_rates r WHERE r.rate_date<=m.movement_date::date AND r.rate_type='official'
 AND ((r.base_currency_code=m.currency_code AND r.quote_currency_code=c.base_currency_code) OR (r.quote_currency_code=m.currency_code AND r.base_currency_code=c.base_currency_code))
 ORDER BY r.rate_date DESC,r.created_at DESC LIMIT 1) er ON m.currency_code IS DISTINCT FROM c.base_currency_code
WHERE m.sector_id IS NOT NULL AND m.movement_type='INGRESOS' AND m.operational_status='COMPLETADO'
 AND lower(coalesce(m.financial_status::text,'')) NOT IN ('pendiente','cancelado','anulado')
 AND coalesce(m.source_payload->>'is_internal_transfer','false')<>'true'
 AND upper(coalesce(m.category,'')) NOT IN ('CAPITAL INICIAL','TRANSFERENCIA INTERNA')
GROUP BY m.club_id,m.sector_id,date_trunc('month',m.movement_date::timestamp AT TIME ZONE coalesce(nullif(c.timezone,''),'America/Argentina/Buenos_Aires'));

CREATE OR REPLACE VIEW miclub.v_sector_capacity_metrics AS
WITH enrollment_counts AS (
 SELECT a.club_id,a.sector_id,count(e.id)::numeric active_count FROM miclub.activities a JOIN miclub.enrollments e ON e.club_id=a.club_id AND e.activity_id=a.id
 WHERE e.superseded_at IS NULL AND coalesce(e.inactive,false)=false AND e.status IN ('al_dia','nuevo_inscripto','adeudando') GROUP BY a.club_id,a.sector_id
), income AS (
 SELECT monthly.*,date_trunc('month',now() AT TIME ZONE coalesce(nullif(c.timezone,''),'America/Argentina/Buenos_Aires'))::date current_month
 FROM miclub.v_sector_monthly_completed_income monthly JOIN miclub.clubs c ON c.id=monthly.club_id
), income_rollup AS (
 SELECT club_id,sector_id,max(income) FILTER(WHERE month<current_month) historical_record,coalesce(max(income) FILTER(WHERE month=current_month),0) current_income
 FROM income GROUP BY club_id,sector_id
)
SELECT s.club_id,s.id sector_id,s.capacity_mode,s.configured_capacity,
 CASE WHEN s.capacity_mode='ENROLLMENTS' THEN s.configured_capacity::numeric ELSE r.historical_record END maximum_capacity,
 CASE WHEN s.capacity_mode='ENROLLMENTS' THEN coalesce(e.active_count,0) ELSE r.current_income END current_usage,
 CASE WHEN s.capacity_mode='INCOME' AND coalesce(r.historical_record,0)<=0 THEN NULL WHEN s.capacity_mode='ENROLLMENTS' AND coalesce(s.configured_capacity,0)<=0 THEN NULL WHEN s.capacity_mode='ENROLLMENTS' THEN coalesce(e.active_count,0)*100/s.configured_capacity ELSE r.current_income*100/r.historical_record END utilization_percentage,
 CASE WHEN s.capacity_mode='INCOME' AND coalesce(r.historical_record,0)<=0 THEN NULL WHEN s.capacity_mode='ENROLLMENTS' AND coalesce(s.configured_capacity,0)<=0 THEN NULL WHEN s.capacity_mode='ENROLLMENTS' THEN greatest(0,100-coalesce(e.active_count,0)*100/s.configured_capacity) ELSE greatest(0,100-r.current_income*100/r.historical_record) END idle_percentage,
 CASE WHEN s.capacity_mode='INCOME' AND coalesce(r.historical_record,0)<=0 THEN 'NO_DATA' WHEN s.capacity_mode IN ('INCOME','ENROLLMENTS') THEN 'AVAILABLE' ELSE 'NOT_CONFIGURED' END data_status
FROM miclub.sectors s LEFT JOIN enrollment_counts e ON e.club_id=s.club_id AND e.sector_id=s.id LEFT JOIN income_rollup r ON r.club_id=s.club_id AND r.sector_id=s.id;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='miclub_runtime') THEN
 GRANT SELECT ON miclub.v_sector_monthly_completed_income,miclub.v_sector_capacity_metrics TO miclub_runtime;
END IF; END $$;

SELECT * FROM miclub.v_sector_capacity_metrics ORDER BY club_id,sector_id;
