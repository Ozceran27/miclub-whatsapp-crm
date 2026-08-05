/* CREACIÓN MANUAL — miclub.employees.
   Objetivo: registrar datos laborales sin duplicar datos personales; los datos
   civiles/contacto siguen viviendo en miclub.people y se referencian por person_id.

   Ejecutar sólo después de backup verificado. El bloque aborta si ya existe
   miclub.employees o una tabla equivalente en el schema miclub con las columnas
   laborales mínimas (club_id + person_id + employment_start_date + position/status).

   Rollback antes de COMMIT: ROLLBACK. Después de COMMIT: usar el bloque de
   rollback documentado al final si la tabla quedó vacía, o restaurar backup si
   ya se insertaron empleados. */
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS miclub;

DO $$
DECLARE
  equivalent_table text;
BEGIN
  IF to_regclass('miclub.employees') IS NOT NULL THEN
    RAISE EXCEPTION 'No se crea miclub.employees: la tabla ya existe';
  END IF;

  SELECT c.table_name
  INTO equivalent_table
  FROM information_schema.columns c
  WHERE c.table_schema = 'miclub'
    AND c.table_name <> 'employees'
    AND c.column_name IN ('club_id', 'person_id', 'employment_start_date')
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns s
      WHERE s.table_schema = c.table_schema
        AND s.table_name = c.table_name
        AND s.column_name IN ('status', 'position')
    )
  GROUP BY c.table_name
  HAVING count(DISTINCT c.column_name) = 3
  ORDER BY c.table_name
  LIMIT 1;

  IF equivalent_table IS NOT NULL THEN
    RAISE EXCEPTION 'No se crea miclub.employees: posible tabla equivalente existente miclub.%', equivalent_table;
  END IF;
END $$;

CREATE TABLE miclub.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES miclub.people(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  sector_id uuid REFERENCES miclub.sectors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated', 'archived')),
  salary numeric(14,2) CHECK (salary IS NULL OR salary >= 0),
  employment_start_date date,
  employment_end_date date,
  position text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_by uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  CONSTRAINT employees_employment_dates_check CHECK (
    employment_end_date IS NULL
    OR employment_start_date IS NULL
    OR employment_end_date >= employment_start_date
  ),
  CONSTRAINT employees_archived_status_check CHECK (
    archived_at IS NULL OR status = 'archived'
  )
);

COMMENT ON TABLE miclub.employees IS
  'Datos laborales de empleados por club; no duplica datos personales, usa person_id hacia miclub.people.';
COMMENT ON COLUMN miclub.employees.person_id IS
  'Referencia al perfil personal tenant-local en miclub.people; nombres, DNI, email y teléfono no se duplican aquí.';
COMMENT ON COLUMN miclub.employees.user_id IS
  'Cuenta global opcional para empleados con acceso al sistema.';
COMMENT ON COLUMN miclub.employees.membership_id IS
  'Membresía/rol opcional en el club para autorización de la cuenta vinculada.';
COMMENT ON COLUMN miclub.employees.sector_id IS
  'Sector operativo principal opcional del empleado.';

CREATE UNIQUE INDEX employees_club_person_active_key
  ON miclub.employees (club_id, person_id)
  WHERE archived_at IS NULL AND status <> 'terminated';
CREATE INDEX employees_club_status_idx ON miclub.employees (club_id, status);
CREATE INDEX employees_club_sector_idx ON miclub.employees (club_id, sector_id) WHERE sector_id IS NOT NULL;
CREATE INDEX employees_user_id_idx ON miclub.employees (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX employees_membership_id_idx ON miclub.employees (membership_id) WHERE membership_id IS NOT NULL;

CREATE OR REPLACE FUNCTION miclub.validate_employee_tenant_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM miclub.people p WHERE p.id = NEW.person_id AND p.club_id = NEW.club_id) THEN
    RAISE EXCEPTION 'employees.person_id % no pertenece al club %', NEW.person_id, NEW.club_id;
  END IF;

  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM miclub.people p
    WHERE p.id = NEW.person_id AND p.club_id = NEW.club_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'employees.user_id % no coincide con people.user_id para person_id %', NEW.user_id, NEW.person_id;
  END IF;

  IF NEW.membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM miclub.user_club_memberships m
    WHERE m.id = NEW.membership_id
      AND m.club_id = NEW.club_id
      AND (NEW.user_id IS NULL OR m.user_id = NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'employees.membership_id % no pertenece al club/usuario indicado', NEW.membership_id;
  END IF;

  IF NEW.sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM miclub.sectors s WHERE s.id = NEW.sector_id AND s.club_id = NEW.club_id
  ) THEN
    RAISE EXCEPTION 'employees.sector_id % no pertenece al club %', NEW.sector_id, NEW.club_id;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_employees_validate_tenant_refs
BEFORE INSERT OR UPDATE ON miclub.employees
FOR EACH ROW EXECUTE FUNCTION miclub.validate_employee_tenant_refs();

-- Validación inmediata de estructura creada y ausencia de datos personales duplicados.
SELECT
  to_regclass('miclub.employees') IS NOT NULL AS employees_exists,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'miclub'
      AND table_name = 'employees'
      AND column_name IN ('first_name', 'last_name', 'dni', 'normalized_dni', 'phone', 'normalized_phone', 'email')
  ) AS no_personal_data_columns;

COMMIT;

/* Rollback post-COMMIT sólo si todavía no hay datos cargados:
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.employees) THEN
    RAISE EXCEPTION 'Rollback seguro cancelado: miclub.employees contiene filas';
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_employees_validate_tenant_refs ON miclub.employees;
DROP FUNCTION IF EXISTS miclub.validate_employee_tenant_refs();
DROP TABLE IF EXISTS miclub.employees;
COMMIT;
*/
