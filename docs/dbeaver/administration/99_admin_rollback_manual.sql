/*
  miClub — rollback manual para scripts administrativos.

  Objetivo: revertir, cuando sea seguro, los objetos creados por los scripts
  manuales de docs/dbeaver/administration. No usa UUID hardcodeados.

  Precondiciones:
  - Ejecutar sólo después de backup verificado.
  - Este rollback aborta si detecta datos en tablas creadas por los scripts.
  - Las columnas agregadas a tablas con datos históricos se dejan comentadas por
    defecto para evitar pérdida accidental de información.
*/

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

SELECT
  'rollback_preconditions' AS diagnostic,
  to_regclass('miclub.employees') IS NOT NULL AS employees_exists,
  to_regclass('miclub.tasks') IS NOT NULL AS tasks_exists,
  to_regclass('miclub.approval_requests') IS NOT NULL AS approval_requests_exists,
  to_regclass('miclub.movements') IS NOT NULL AS movements_exists,
  to_regclass('miclub.activities') IS NOT NULL AS activities_exists,
  to_regclass('miclub.sectors') IS NOT NULL AS sectors_exists;

DO $$
DECLARE
  employees_count bigint := 0;
  tasks_count bigint := 0;
  approvals_count bigint := 0;
BEGIN
  IF to_regclass('miclub.employees') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM miclub.employees' INTO employees_count;
  END IF;
  IF to_regclass('miclub.tasks') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM miclub.tasks' INTO tasks_count;
  END IF;
  IF to_regclass('miclub.approval_requests') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM miclub.approval_requests' INTO approvals_count;
  END IF;

  IF employees_count > 0 OR tasks_count > 0 OR approvals_count > 0 THEN
    RAISE EXCEPTION 'Rollback cancelado: employees=%, tasks=%, approval_requests=% tienen datos', employees_count, tasks_count, approvals_count;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_tasks_audit_mutation ON miclub.tasks;
DROP TRIGGER IF EXISTS trg_approval_requests_audit_mutation ON miclub.approval_requests;
DROP TRIGGER IF EXISTS trg_tasks_validate_tenant_refs ON miclub.tasks;
DROP TRIGGER IF EXISTS trg_approval_requests_validate_tenant_refs ON miclub.approval_requests;
DROP FUNCTION IF EXISTS miclub.audit_tasks_and_approvals_mutation();
DROP FUNCTION IF EXISTS miclub.validate_tasks_and_approvals_tenant_refs();
DROP TABLE IF EXISTS miclub.approval_requests;
DROP TABLE IF EXISTS miclub.tasks;

DROP TRIGGER IF EXISTS trg_employees_validate_tenant_refs ON miclub.employees;
DROP FUNCTION IF EXISTS miclub.validate_employee_tenant_refs();
DROP TABLE IF EXISTS miclub.employees;

ALTER TABLE IF EXISTS miclub.movements DROP CONSTRAINT IF EXISTS movements_activity_id_fkey;
DROP INDEX IF EXISTS miclub.movements_club_activity_date_idx;
DROP INDEX IF EXISTS miclub.movements_activity_date_idx;
ALTER TABLE IF EXISTS miclub.movements DROP COLUMN IF EXISTS activity_id;

-- Rollback destructivo opcional de columnas de evolución. Descomentar sólo si
-- se confirmó que no hay datos valiosos en esas columnas y existe backup.
-- ALTER TABLE IF EXISTS miclub.activities DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS generates_enrollments, DROP COLUMN IF EXISTS settlement_mode, DROP COLUMN IF EXISTS settlement_fixed_amount, DROP COLUMN IF EXISTS settlement_category_id, DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE IF EXISTS miclub.sectors DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS icon, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS capacity_mode, DROP COLUMN IF EXISTS configured_capacity, DROP COLUMN IF EXISTS is_system, DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_by;

SELECT
  'rollback_validation' AS diagnostic,
  to_regclass('miclub.employees') IS NULL AS employees_removed,
  to_regclass('miclub.tasks') IS NULL AS tasks_removed,
  to_regclass('miclub.approval_requests') IS NULL AS approval_requests_removed;

COMMIT;
