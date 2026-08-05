/* CREACIÓN MANUAL IDEMPOTENTE — miclub.tasks y miclub.approval_requests.

   Objetivo: agregar tablas operativas para tareas y solicitudes de aprobación,
   con scope explícito por club, referencias opcionales a usuario/membresía,
   estados controlados, timestamps, archived_at y auditoría automática de fases
   de mutación en miclub.audit_log.

   Seguridad: este SQL sólo define estructura, constraints, triggers de validación
   y triggers de auditoría. No crea handlers/procedimientos que ejecuten JSON ni
   payloads arbitrarios.

   Ejecutar sólo después de backup verificado. Rollback antes de COMMIT: ROLLBACK.
   Post-COMMIT: usar el bloque de rollback documentado al final sólo si no hay
   datos cargados en las tablas nuevas. */
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS miclub;

CREATE TABLE IF NOT EXISTS miclub.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  created_by_membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  assigned_to_membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled', 'archived')),
  CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT tasks_title_not_blank_check CHECK (btrim(title) <> ''),
  CONSTRAINT tasks_completed_status_check CHECK (completed_at IS NULL OR status = 'completed'),
  CONSTRAINT tasks_archived_status_check CHECK (archived_at IS NULL OR status = 'archived')
);

CREATE TABLE IF NOT EXISTS miclub.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  requested_by_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  requested_by_membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  assigned_to_membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  decided_by_membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  target_entity_type text,
  target_entity_id uuid,
  decision_reason text,
  decided_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT approval_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'archived')),
  CONSTRAINT approval_requests_title_not_blank_check CHECK (btrim(title) <> ''),
  CONSTRAINT approval_requests_decision_status_check CHECK (
    (decided_at IS NULL AND decided_by_user_id IS NULL AND decided_by_membership_id IS NULL)
    OR status IN ('approved', 'rejected')
  ),
  CONSTRAINT approval_requests_archived_status_check CHECK (archived_at IS NULL OR status = 'archived')
);

COMMENT ON TABLE miclub.tasks IS 'Tareas operativas por club; no ejecuta payloads JSON arbitrarios.';
COMMENT ON TABLE miclub.approval_requests IS 'Solicitudes de aprobación por club; registra decisión y responsable sin ejecutar payloads JSON arbitrarios.';
COMMENT ON COLUMN miclub.tasks.metadata IS 'Metadatos descriptivos sanitizados; no debe contener credenciales ni instrucciones ejecutables.';
COMMENT ON COLUMN miclub.approval_requests.metadata IS 'Metadatos descriptivos sanitizados; no debe contener credenciales ni instrucciones ejecutables.';

CREATE INDEX IF NOT EXISTS tasks_club_status_idx ON miclub.tasks (club_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assigned_membership_idx ON miclub.tasks (assigned_to_membership_id) WHERE assigned_to_membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_assigned_user_idx ON miclub.tasks (assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_active_due_idx ON miclub.tasks (club_id, due_at) WHERE archived_at IS NULL AND due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS approval_requests_club_status_idx ON miclub.approval_requests (club_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS approval_requests_requested_membership_idx ON miclub.approval_requests (requested_by_membership_id) WHERE requested_by_membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS approval_requests_assigned_membership_idx ON miclub.approval_requests (assigned_to_membership_id) WHERE assigned_to_membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS approval_requests_decided_membership_idx ON miclub.approval_requests (decided_by_membership_id) WHERE decided_by_membership_id IS NOT NULL;

CREATE OR REPLACE FUNCTION miclub.validate_tasks_and_approvals_tenant_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  membership_column text;
  membership_value uuid;
  expected_user uuid;
BEGIN
  NEW.updated_at = now();

  IF TG_TABLE_NAME = 'tasks' AND NEW.completed_at IS NULL AND NEW.status = 'completed' THEN
    NEW.completed_at = now();
  END IF;

  IF TG_TABLE_NAME = 'approval_requests' AND NEW.decided_at IS NULL AND NEW.status IN ('approved', 'rejected') THEN
    NEW.decided_at = now();
  END IF;

  FOREACH membership_column IN ARRAY CASE TG_TABLE_NAME
    WHEN 'tasks' THEN ARRAY['created_by_membership_id', 'assigned_to_membership_id']
    ELSE ARRAY['requested_by_membership_id', 'assigned_to_membership_id', 'decided_by_membership_id']
  END LOOP
    EXECUTE format('SELECT ($1).%I', membership_column) USING NEW INTO membership_value;
    IF membership_value IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM miclub.user_club_memberships m WHERE m.id = membership_value AND m.club_id = NEW.club_id
    ) THEN
      RAISE EXCEPTION '%.% % no pertenece al club %', TG_TABLE_NAME, membership_column, membership_value, NEW.club_id;
    END IF;
  END LOOP;

  IF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.created_by_membership_id IS NOT NULL AND NEW.created_by_user_id IS NOT NULL THEN
      SELECT m.user_id INTO expected_user FROM miclub.user_club_memberships m WHERE m.id = NEW.created_by_membership_id;
      IF expected_user IS DISTINCT FROM NEW.created_by_user_id THEN
        RAISE EXCEPTION 'tasks.created_by_membership_id no coincide con created_by_user_id';
      END IF;
    END IF;
    IF NEW.assigned_to_membership_id IS NOT NULL AND NEW.assigned_to_user_id IS NOT NULL THEN
      SELECT m.user_id INTO expected_user FROM miclub.user_club_memberships m WHERE m.id = NEW.assigned_to_membership_id;
      IF expected_user IS DISTINCT FROM NEW.assigned_to_user_id THEN
        RAISE EXCEPTION 'tasks.assigned_to_membership_id no coincide con assigned_to_user_id';
      END IF;
    END IF;
  ELSE
    IF NEW.requested_by_membership_id IS NOT NULL AND NEW.requested_by_user_id IS NOT NULL THEN
      SELECT m.user_id INTO expected_user FROM miclub.user_club_memberships m WHERE m.id = NEW.requested_by_membership_id;
      IF expected_user IS DISTINCT FROM NEW.requested_by_user_id THEN RAISE EXCEPTION 'approval_requests.requested_by_membership_id no coincide con requested_by_user_id'; END IF;
    END IF;
    IF NEW.assigned_to_membership_id IS NOT NULL AND NEW.assigned_to_user_id IS NOT NULL THEN
      SELECT m.user_id INTO expected_user FROM miclub.user_club_memberships m WHERE m.id = NEW.assigned_to_membership_id;
      IF expected_user IS DISTINCT FROM NEW.assigned_to_user_id THEN RAISE EXCEPTION 'approval_requests.assigned_to_membership_id no coincide con assigned_to_user_id'; END IF;
    END IF;
    IF NEW.decided_by_membership_id IS NOT NULL AND NEW.decided_by_user_id IS NOT NULL THEN
      SELECT m.user_id INTO expected_user FROM miclub.user_club_memberships m WHERE m.id = NEW.decided_by_membership_id;
      IF expected_user IS DISTINCT FROM NEW.decided_by_user_id THEN RAISE EXCEPTION 'approval_requests.decided_by_membership_id no coincide con decided_by_user_id'; END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION miclub.audit_tasks_and_approvals_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data jsonb;
  actor_user_id uuid;
  actor_membership_id uuid;
BEGIN
  row_data = to_jsonb(COALESCE(NEW, OLD));
  actor_user_id = COALESCE((row_data->>'updated_by_user_id')::uuid, (row_data->>'created_by_user_id')::uuid, (row_data->>'requested_by_user_id')::uuid, (row_data->>'decided_by_user_id')::uuid);
  actor_membership_id = COALESCE((row_data->>'created_by_membership_id')::uuid, (row_data->>'requested_by_membership_id')::uuid, (row_data->>'decided_by_membership_id')::uuid, (row_data->>'assigned_to_membership_id')::uuid);

  INSERT INTO miclub.audit_log (user_id, club_id, membership_id, action, entity_type, entity_id, old_data, new_data, result, metadata)
  VALUES (
    actor_user_id,
    (row_data->>'club_id')::uuid,
    actor_membership_id,
    lower(TG_OP),
    TG_TABLE_NAME,
    (row_data->>'id')::uuid,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    'success',
    jsonb_build_object('eventType', 'sensitive_change', 'mutationPhase', 'after_' || lower(TG_OP), 'source', 'manual_sql_trigger')
  );

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_tasks_validate_tenant_refs ON miclub.tasks;
CREATE TRIGGER trg_tasks_validate_tenant_refs
BEFORE INSERT OR UPDATE ON miclub.tasks
FOR EACH ROW EXECUTE FUNCTION miclub.validate_tasks_and_approvals_tenant_refs();

DROP TRIGGER IF EXISTS trg_approval_requests_validate_tenant_refs ON miclub.approval_requests;
CREATE TRIGGER trg_approval_requests_validate_tenant_refs
BEFORE INSERT OR UPDATE ON miclub.approval_requests
FOR EACH ROW EXECUTE FUNCTION miclub.validate_tasks_and_approvals_tenant_refs();

DROP TRIGGER IF EXISTS trg_tasks_audit_mutation ON miclub.tasks;
CREATE TRIGGER trg_tasks_audit_mutation
AFTER INSERT OR UPDATE OR DELETE ON miclub.tasks
FOR EACH ROW EXECUTE FUNCTION miclub.audit_tasks_and_approvals_mutation();

DROP TRIGGER IF EXISTS trg_approval_requests_audit_mutation ON miclub.approval_requests;
CREATE TRIGGER trg_approval_requests_audit_mutation
AFTER INSERT OR UPDATE OR DELETE ON miclub.approval_requests
FOR EACH ROW EXECUTE FUNCTION miclub.audit_tasks_and_approvals_mutation();

SELECT
  to_regclass('miclub.tasks') IS NOT NULL AS tasks_exists,
  to_regclass('miclub.approval_requests') IS NOT NULL AS approval_requests_exists,
  to_regclass('miclub.audit_log') IS NOT NULL AS audit_log_exists;

COMMIT;

/* Rollback post-COMMIT sólo si todavía no hay datos cargados:
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.tasks) OR EXISTS (SELECT 1 FROM miclub.approval_requests) THEN
    RAISE EXCEPTION 'Rollback seguro cancelado: tasks/approval_requests contienen filas';
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
COMMIT;
*/
