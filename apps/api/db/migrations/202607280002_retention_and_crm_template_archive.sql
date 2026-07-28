BEGIN;

-- Los hechos financieros son inmutables respecto de DELETE. Las correcciones se
-- representan mediante estados y contramovimientos, nunca removiendo evidencia.
CREATE OR REPLACE FUNCTION miclub.reject_financial_fact_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'physical deletion of %.% is forbidden; cancel or reverse the record', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS movements_reject_physical_delete ON miclub.movements;
CREATE TRIGGER movements_reject_physical_delete
BEFORE DELETE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.reject_financial_fact_delete();

DROP TRIGGER IF EXISTS payments_reject_physical_delete ON miclub.payments;
CREATE TRIGGER payments_reject_physical_delete
BEFORE DELETE ON miclub.payments FOR EACH ROW EXECUTE FUNCTION miclub.reject_financial_fact_delete();

ALTER TABLE miclub.crm_message_templates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES miclub.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_templates_active_idx
  ON miclub.crm_message_templates (club_id, is_default DESC, created_at)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN miclub.crm_message_templates.archived_at IS
  'Baja lógica reversible; las plantillas CRM no se eliminan físicamente desde la API.';

COMMIT;
