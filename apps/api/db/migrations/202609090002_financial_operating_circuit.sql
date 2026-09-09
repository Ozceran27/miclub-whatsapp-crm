-- DEC-017. Forward-only additive history; no inferred historical responsible.
-- Execute via the versioned migration runner or the manual DBeaver wrapper.
DO $$ BEGIN
 IF to_regclass('miclub.activity_terms') IS NULL OR to_regclass('miclub.payment_allocations') IS NULL
 THEN RAISE EXCEPTION 'Missing financial prerequisites'; END IF;
END $$;

ALTER TABLE miclub.activity_terms
 ADD COLUMN responsible_person_id uuid,
 ADD COLUMN partial_month_policy text CHECK (partial_month_policy IN ('CALENDAR_DAYS','FULL_MONTH')),
 ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD CONSTRAINT activity_terms_responsible_tenant_fk FOREIGN KEY (responsible_person_id,club_id) REFERENCES miclub.people(id,club_id),
 ADD CONSTRAINT activity_terms_id_club_key UNIQUE(id,club_id);

ALTER TABLE miclub.activity_settlements
 DROP CONSTRAINT activity_settlements_activity_id_period_from_period_to_key,
 ADD COLUMN circuit_version integer,
 ADD COLUMN review_state text NOT NULL DEFAULT 'DRAFT' CHECK (review_state IN ('DRAFT','APPROVED','REQUIRES_REVIEW')),
 ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN calculation jsonb,
 ADD COLUMN calculation_hash text,
 ADD COLUMN closed_at timestamptz,
 ADD COLUMN reviewed_by uuid REFERENCES miclub.users(id),
 ADD CONSTRAINT activity_settlements_term_period_key UNIQUE(activity_term_id,period_from,period_to);

ALTER TABLE miclub.receivables ADD CONSTRAINT receivables_id_club_key UNIQUE(id,club_id);
ALTER TABLE miclub.movements ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN receivable_id uuid,
 ADD COLUMN payout_group_id uuid,
 ADD CONSTRAINT movements_receivable_tenant_fk FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id);
ALTER TABLE miclub.receivables ADD COLUMN cancelled_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(cancelled_amount>=0 AND cancelled_amount<=amount),
 ADD COLUMN currency_code text NOT NULL DEFAULT 'ARS' REFERENCES miclub.currencies(code),
 ADD COLUMN source_key text;
CREATE UNIQUE INDEX receivables_source_key_unique ON miclub.receivables(club_id,source_key) WHERE source_key IS NOT NULL;
ALTER TABLE miclub.enrollments ADD COLUMN debt_on_exit text CHECK(debt_on_exit IN ('KEEP','FORGIVE'));

CREATE TABLE miclub.finance_operations (
 club_id uuid NOT NULL REFERENCES miclub.clubs(id), operation_key text NOT NULL,
 request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(club_id,operation_key)
);
CREATE TABLE miclub.finance_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 entity_type text NOT NULL, entity_id uuid NOT NULL, before_data jsonb, after_data jsonb,
 actor_id uuid REFERENCES miclub.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_history_entity_idx ON miclub.finance_history(club_id,entity_type,entity_id,created_at);
CREATE TABLE miclub.settlement_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 settlement_id uuid NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES miclub.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id), UNIQUE(settlement_id,revision)
);
CREATE TABLE miclub.fixed_fee_distributions (
 club_id uuid NOT NULL, activity_term_id uuid NOT NULL,
 month date NOT NULL CHECK(extract(day FROM month)=1), amount numeric(14,2) NOT NULL CHECK(amount>=0),
 PRIMARY KEY(club_id,activity_term_id,month),
 FOREIGN KEY(activity_term_id,club_id) REFERENCES miclub.activity_terms(id,club_id)
);
CREATE TABLE miclub.movement_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 original_movement_id uuid NOT NULL, refund_movement_id uuid NOT NULL,
 original_term_id uuid, responsible_amount numeric(14,2) NOT NULL CHECK(responsible_amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(original_term_id,club_id) REFERENCES miclub.activity_terms(id,club_id),
 FOREIGN KEY(original_movement_id,club_id) REFERENCES miclub.movements(id,club_id),
 FOREIGN KEY(refund_movement_id,club_id) REFERENCES miclub.movements(id,club_id), UNIQUE(club_id,refund_movement_id)
);
CREATE TABLE miclub.settlement_compensations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 person_id uuid NOT NULL, currency_code text NOT NULL REFERENCES miclub.currencies(code),
 debt_settlement_id uuid NOT NULL, credit_settlement_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),
 FOREIGN KEY(debt_settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id),
 FOREIGN KEY(credit_settlement_id,club_id) REFERENCES miclub.activity_settlements(id,club_id)
);
CREATE TABLE miclub.finance_startups (
 club_id uuid PRIMARY KEY REFERENCES miclub.clubs(id), mode text NOT NULL CHECK(mode IN ('RECONSTRUCTION','CUTOFF')),
 cutoff_date date NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REQUIRES_REVIEW')),
 revision integer NOT NULL DEFAULT 1, expected_balances jsonb NOT NULL DEFAULT '[]', approved_snapshot jsonb,
 approved_by uuid REFERENCES miclub.users(id), approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE miclub.initial_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL REFERENCES miclub.clubs(id),
 person_id uuid NOT NULL, activity_id uuid, kind text NOT NULL CHECK(kind IN ('STUDENT','RESPONSIBLE','EMPLOYEE','SUPPLIER')),
 currency_code text NOT NULL REFERENCES miclub.currencies(code), amount numeric(14,2) NOT NULL,
 settled_amount numeric(14,2) NOT NULL DEFAULT 0, source_key text NOT NULL, due_date date NOT NULL,
 receivable_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(person_id,club_id) REFERENCES miclub.people(id,club_id),
 FOREIGN KEY(activity_id,club_id) REFERENCES miclub.activities(id,club_id),
 FOREIGN KEY(receivable_id,club_id) REFERENCES miclub.receivables(id,club_id), UNIQUE(club_id,source_key)
);

-- Serialize financial writes in the tenant. Reads/calculation use this same lock.
CREATE FUNCTION miclub.finance_lock(p_club uuid) RETURNS void LANGUAGE sql AS $$
 SELECT pg_advisory_xact_lock(hashtextextended(p_club::text,17017));
$$;
CREATE FUNCTION miclub.finance_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; reason text;
BEGIN
 PERFORM miclub.finance_lock(NEW.club_id);
 actor := nullif(current_setting('app.finance_actor',true),'')::uuid;
 reason := coalesce(nullif(current_setting('app.finance_reason',true),''),'Operación registrada por el sistema');
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN ('movements','activity_terms') THEN NEW.revision:=OLD.revision+1; END IF;
  INSERT INTO miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason)
  VALUES(NEW.club_id,TG_TABLE_NAME,NEW.id,to_jsonb(OLD),to_jsonb(NEW),actor,reason);
  IF TG_TABLE_NAME='movements' THEN
   IF OLD.reconciled_at IS NOT NULL THEN NEW.reconciled_at:=NULL; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_movements_history BEFORE INSERT OR UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
CREATE TRIGGER finance_terms_history BEFORE INSERT OR UPDATE ON miclub.activity_terms FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
CREATE TRIGGER finance_payments_history BEFORE INSERT OR UPDATE ON miclub.payments FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();
CREATE TRIGGER finance_receivables_history BEFORE INSERT OR UPDATE ON miclub.receivables FOR EACH ROW EXECUTE FUNCTION miclub.finance_capture_change();

-- Coordinated correction is the only escape from the existing finalized guard.
CREATE OR REPLACE FUNCTION miclub.protect_finalized_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.reconciled_at IS NOT NULL OR miclub.movement_has_payment_allocation(OLD.id))
 AND nullif(current_setting('app.finance_reason',true),'') IS NULL THEN
  RAISE EXCEPTION 'Use the authorized coordinated financial correction';
 END IF;
 IF NEW.id<>OLD.id OR NEW.club_id<>OLD.club_id OR NEW.source IS DISTINCT FROM OLD.source
 OR NEW.external_id IS DISTINCT FROM OLD.external_id OR NEW.source_payload IS DISTINCT FROM OLD.source_payload THEN
  RAISE EXCEPTION 'Financial identity and origin are immutable';
 END IF;
 RETURN NEW;
END $$;

-- No guessed historical backfill. New agreements capture the selected instructor.
CREATE FUNCTION miclub.finance_term_responsible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.responsible_person_id IS NULL THEN
  SELECT i.person_id INTO NEW.responsible_person_id FROM miclub.activities a
  JOIN miclub.instructors i ON i.id=a.instructor_id AND i.club_id=a.club_id
  WHERE a.id=NEW.activity_id AND a.club_id=NEW.club_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_term_new_responsible BEFORE INSERT ON miclub.activity_terms FOR EACH ROW EXECUTE FUNCTION miclub.finance_term_responsible();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_operations','finance_history','settlement_reviews','fixed_fee_distributions','movement_refunds','settlement_compensations','finance_startups','initial_obligations'] LOOP
  EXECUTE format('ALTER TABLE miclub.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE miclub.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON miclub.%I USING(club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid) WITH CHECK(club_id=nullif(current_setting(''app.club_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON miclub.%I TO miclub_runtime',t);
 END LOOP;
END $$;
REVOKE UPDATE ON miclub.finance_history,miclub.settlement_reviews FROM miclub_runtime;
-- The approved opening snapshot remains effective while a correction awaits
-- reconciliation. Superseded onboarding capital is never counted a second time.
CREATE OR REPLACE VIEW miclub.v_financial_account_liquidity AS
 SELECT a.club_id,a.id AS account_id,a.code,a.name,a.currency_code,
 (coalesce((SELECT (x->>'amount')::numeric FROM jsonb_array_elements(st.approved_snapshot->'accounts') x WHERE x->>'accountId'=a.id::text),0)
 + coalesce(sum(CASE WHEN m.movement_type='EGRESOS' THEN -m.amount ELSE m.amount END),0))::numeric(14,2) balance
 FROM miclub.financial_accounts a JOIN miclub.clubs c ON c.id=a.club_id
 LEFT JOIN miclub.finance_startups st ON st.club_id=a.club_id AND st.approved_snapshot IS NOT NULL
 LEFT JOIN miclub.movements m ON m.club_id=a.club_id AND m.account_id=a.id AND m.operational_status='COMPLETADO' AND m.voided_at IS NULL
 AND (st.club_id IS NULL OR ((m.movement_date AT TIME ZONE coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date>st.cutoff_date
 AND NOT EXISTS(SELECT 1 FROM miclub.opening_balance_movements ob WHERE ob.movement_id=m.id)))
 GROUP BY a.club_id,a.id,a.code,a.name,a.currency_code,st.approved_snapshot;
UPDATE miclub.user_club_memberships m SET permissions=(SELECT array_agg(DISTINCT p) FROM unnest(m.permissions || ARRAY['finance.review','finance.pay','finance.correct','finance.reconcile']) p)
FROM miclub.roles r WHERE r.id=m.role_id AND r.club_id=m.club_id AND r.code IN ('DIRECTOR','owner','admin');
