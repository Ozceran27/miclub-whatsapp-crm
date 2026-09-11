-- DEC-017: explicit cash and non-cash applications to opening obligations.
-- Additive forward migration; never rewrite the approved opening amounts.
ALTER TABLE miclub.xlsx_import_rows DROP CONSTRAINT xlsx_import_rows_sheet_check;
ALTER TABLE miclub.xlsx_import_rows ADD CONSTRAINT xlsx_import_rows_sheet_check
 CHECK (sheet IN ('ADMINISTRACIÓN','INSCRIPCIONES','SALDOS_INICIALES'));
ALTER TABLE miclub.initial_obligations ADD CONSTRAINT initial_obligations_id_club_unique UNIQUE(id,club_id);
ALTER TABLE miclub.initial_obligations ADD COLUMN review_state text NOT NULL DEFAULT 'APPROVED' CHECK(review_state IN ('DRAFT','APPROVED'));
ALTER TABLE miclub.movements ADD COLUMN initial_obligation_id uuid;
ALTER TABLE miclub.movements ADD CONSTRAINT movement_initial_obligation_tenant_fk
 FOREIGN KEY(initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
ALTER TABLE miclub.settlement_compensations ALTER COLUMN debt_settlement_id DROP NOT NULL;
ALTER TABLE miclub.settlement_compensations ALTER COLUMN credit_settlement_id DROP NOT NULL;
ALTER TABLE miclub.settlement_compensations ADD COLUMN debt_initial_obligation_id uuid;
ALTER TABLE miclub.settlement_compensations ADD COLUMN credit_initial_obligation_id uuid;
ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_debt_initial_tenant_fk
 FOREIGN KEY(debt_initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_credit_initial_tenant_fk
 FOREIGN KEY(credit_initial_obligation_id,club_id) REFERENCES miclub.initial_obligations(id,club_id);
ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_exact_debt_source
 CHECK(num_nonnulls(debt_settlement_id,debt_initial_obligation_id)=1);
ALTER TABLE miclub.settlement_compensations ADD CONSTRAINT compensation_exact_credit_source
 CHECK(num_nonnulls(credit_settlement_id,credit_initial_obligation_id)=1);
CREATE TRIGGER capture_initial_obligation_history BEFORE UPDATE ON miclub.initial_obligations
 FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
ALTER TABLE miclub.payment_allocations ADD CONSTRAINT payment_allocations_id_club_unique UNIQUE(id,club_id);
CREATE TABLE miclub.refund_obligation_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 refund_movement_id uuid NOT NULL, payment_allocation_id uuid NOT NULL, receivable_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 FOREIGN KEY(refund_movement_id,club_id) REFERENCES miclub.movements(id,club_id),
 FOREIGN KEY(payment_allocation_id,club_id) REFERENCES miclub.payment_allocations(id,club_id),
 FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id),
 UNIQUE(club_id,refund_movement_id,payment_allocation_id)
);
ALTER TABLE miclub.movement_refunds ADD COLUMN applications_tracked boolean NOT NULL DEFAULT false;
ALTER TABLE miclub.refund_obligation_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE miclub.refund_obligation_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON miclub.refund_obligation_applications
 USING(club_id=nullif(current_setting('app.club_id',true),'')::uuid)
 WITH CHECK(club_id=nullif(current_setting('app.club_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON miclub.refund_obligation_applications TO miclub_runtime;
CREATE TRIGGER capture_refund_application_history BEFORE UPDATE ON miclub.refund_obligation_applications
 FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();

-- Reconciliation itself preserves the new timestamp. A material correction
-- still invalidates it, with its prior value retained in finance_history.
CREATE OR REPLACE FUNCTION miclub.finance_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; reason text;
BEGIN
 PERFORM miclub.finance_lock(NEW.club_id);
 actor := nullif(current_setting('app.finance_actor',true),'')::uuid;
 reason := coalesce(nullif(current_setting('app.finance_reason',true),''),'Operación registrada por el sistema');
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN ('movements','activity_terms') THEN NEW.revision:=OLD.revision+1; END IF;
  IF TG_TABLE_NAME='movements' THEN
   IF OLD.reconciled_at IS NOT NULL AND
      (to_jsonb(NEW)-ARRAY['reconciled_at','revision','updated_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['reconciled_at','revision','updated_at']) THEN NEW.reconciled_at:=NULL; END IF;
  END IF;
  INSERT INTO miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason)
  VALUES(NEW.club_id,TG_TABLE_NAME,NEW.id,to_jsonb(OLD),to_jsonb(NEW),actor,reason);
 ELSE
  INSERT INTO miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason)
  VALUES(NEW.club_id,TG_TABLE_NAME,NEW.id,NULL,to_jsonb(NEW),actor,reason);
 END IF;
 RETURN NEW;
END $$;
