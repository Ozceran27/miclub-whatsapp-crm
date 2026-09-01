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
 (capacity_mode IS NOT NULL AND capacity_mode NOT IN ('ENROLLMENTS','INCOME')) OR
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
