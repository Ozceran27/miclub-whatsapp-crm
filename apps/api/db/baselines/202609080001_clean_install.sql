-- RC baseline 2026-09-08. Fresh installation only; no tenant data.
-- Source: checked-in 202609011504 archive STRUCTURE and nine explicit global catalogs,
-- reconciled with 202609050001-003 in an isolated PostgreSQL 18 instance.
-- Preconditions: empty miclub schema, dedicated migration role, PostgreSQL 18+.
-- Execute via runner (atomic SQL + ledger), or reviewed manual DBeaver package.
-- Rollback: transaction rollback before commit; after commit restore verified backup.
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='miclub') THEN RAISE EXCEPTION 'Baseline requires an empty miclub schema'; END IF; END $$;
-- Versioned cluster provisioning. Run as a PostgreSQL superuser before migrations.
DO $provision$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Role provisioning must run as a PostgreSQL superuser';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miclub_runtime') THEN
    CREATE ROLE miclub_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miclub_admin') THEN
    CREATE ROLE miclub_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
  -- The pre-reset plain-text backup records this historical owner. Keeping it
  -- NOLOGIN lets a clean CI cluster restore the dump without creating a login.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'miclub_app') THEN
    CREATE ROLE miclub_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$provision$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: miclub; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA miclub;


--
-- Name: enrollment_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.enrollment_status AS ENUM (
    'nuevo_inscripto',
    'al_dia',
    'adeudando',
    'abandonado',
    'suspendido',
    'cancelado',
    'otro',
    'reemplazado'
);


--
-- Name: entity_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.entity_status AS ENUM (
    'activa',
    'pendiente',
    'suspendida',
    'cancelada'
);


--
-- Name: financial_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.financial_status AS ENUM (
    'sin_movimientos',
    'pendiente',
    'pagado',
    'parcial',
    'a_liquidar',
    'liquidado',
    'deuda',
    'vencido',
    'cancelado',
    'otro'
);


--
-- Name: import_batch_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.import_batch_status AS ENUM (
    'pending',
    'running',
    'completed',
    'completed_with_errors',
    'failed',
    'dry_run',
    'failed_configuration'
);


--
-- Name: message_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.message_status AS ENUM (
    'prepared',
    'opened',
    'sent_manual',
    'skipped',
    'failed'
);


--
-- Name: movement_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.movement_status AS ENUM (
    'COMPLETADO',
    'PENDIENTE',
    'ANULADO',
    'CANCELADO'
);


--
-- Name: movement_type; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.movement_type AS ENUM (
    'INGRESOS',
    'EGRESOS',
    'CAPITAL'
);


--
-- Name: person_kind; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.person_kind AS ENUM (
    'alumno',
    'proveedor',
    'acreedor',
    'empresa',
    'empleado',
    'encargado',
    'instructor',
    'cliente',
    'otro'
);


--
-- Name: person_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.person_status AS ENUM (
    'activa',
    'pendiente',
    'suspendida',
    'bloqueada',
    'inactiva'
);


--
-- Name: receivable_status; Type: TYPE; Schema: miclub; Owner: -
--

CREATE TYPE miclub.receivable_status AS ENUM (
    'pendiente',
    'pagado',
    'parcial',
    'vencido',
    'cancelado'
);


--
-- Name: assert_activity_has_instructor(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.assert_activity_has_instructor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'miclub'
    AS $$
begin
  if new.archived_at is null and new.status::text = 'activa' and new.instructor_id is null then
    raise exception 'An active activity must have exactly one instructor' using errcode = '23502';
  end if;
  return new;
end $$;


--
-- Name: audit_tasks_and_approvals_mutation(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.audit_tasks_and_approvals_mutation() RETURNS trigger
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


--
-- Name: guard_activity_delete(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.guard_activity_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM miclub.movements WHERE club_id=OLD.club_id AND activity_id=OLD.id)
    OR EXISTS (SELECT 1 FROM miclub.enrollments WHERE club_id=OLD.club_id AND activity_id=OLD.id)
    OR EXISTS (SELECT 1 FROM miclub.activity_terms WHERE club_id=OLD.club_id AND activity_id=OLD.id) THEN
    RAISE EXCEPTION 'activity with movements, enrollments or historical terms must be archived' USING ERRCODE='23503';
  END IF;
  RETURN OLD;
END $$;


--
-- Name: list_active_memberships(uuid); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.list_active_memberships(target_user_id uuid) RETURNS TABLE(membership_id uuid, club_id uuid, club_name text, role_code text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'miclub'
    AS $$
  SELECT membership.id, membership.club_id, club.name, role.code
    FROM miclub.user_club_memberships membership
    JOIN miclub.clubs club
      ON club.id = membership.club_id AND club.is_active = true
    JOIN miclub.roles role
      ON role.id = membership.role_id AND role.club_id = membership.club_id
   WHERE membership.user_id = target_user_id
     AND membership.status = 'active'
   ORDER BY club.name, membership.created_at
$$;


--
-- Name: movement_has_payment_allocation(uuid); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.movement_has_payment_allocation(target_movement_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
  linked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'miclub'
      AND table_name = 'payment_allocations'
      AND column_name = 'movement_id'
  ) THEN
    RETURN false;
  END IF;

  EXECUTE
    'SELECT EXISTS (
       SELECT 1
       FROM miclub.payment_allocations
       WHERE movement_id = $1
     )'
  INTO linked
  USING target_movement_id;

  RETURN linked;
END
$_$;


--
-- Name: next_tenant_sequence(uuid, text); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.next_tenant_sequence(p_club_id uuid, p_entity_type text) RETURNS bigint
    LANGUAGE sql STRICT
    AS $$
  INSERT INTO miclub.tenant_sequences AS tenant_sequence (club_id, entity_type, last_value)
  VALUES (p_club_id, p_entity_type, 1)
  ON CONFLICT (club_id, entity_type)
  DO UPDATE SET last_value = tenant_sequence.last_value + 1
  RETURNING last_value
$$;


--
-- Name: normalize_enrollment_fee_amount(numeric); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.normalize_enrollment_fee_amount(value numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
  with recursive fee_steps(fee) as (
    select coalesce(value, 0::numeric)::numeric
    union all
    select fee / 10
    from fee_steps
    where abs(fee) > 100000::numeric
      and mod(fee, 10::numeric) = 0::numeric
  )
  select fee::numeric(14,2)
  from fee_steps
  order by abs(fee) asc
  limit 1
$$;


--
-- Name: normalize_membership_fee_amount(numeric); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.normalize_membership_fee_amount(value numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
  with recursive normalized(fee) as (
    select coalesce(value, 0::numeric)
    union all
    select fee / 10
    from normalized
    where abs(fee) > 100000
      and mod(fee, 10) = 0
  )
  select fee
  from normalized
  order by abs(fee) asc
  limit 1
$$;


--
-- Name: FUNCTION normalize_membership_fee_amount(value numeric); Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON FUNCTION miclub.normalize_membership_fee_amount(value numeric) IS 'Wrapper legacy para normalizar solo enrollments.fee_amount como membership_fee_unit; no aplica a totales agregados.';


--
-- Name: normalize_membership_fee_amount(numeric, text); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.normalize_membership_fee_amount(value numeric, normalization_context text DEFAULT 'membership_fee_unit'::text) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  select case
    when value is null then 0::numeric
    when rule.context is null then value
    when abs(value) between rule.min_valid_amount and rule.max_valid_amount then value
    when abs(value) > rule.max_valid_amount
      and mod(abs(value), rule.scale_factor) = 0
      and abs(value / rule.scale_factor) between rule.min_valid_amount and rule.max_valid_amount
      then value / rule.scale_factor
    else value
  end
  from (select coalesce(normalization_context, 'membership_fee_unit') as context) requested
  left join miclub.import_amount_normalization_rules rule
    on rule.context = requested.context
   and rule.enabled
$$;


--
-- Name: FUNCTION normalize_membership_fee_amount(value numeric, normalization_context text); Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON FUNCTION miclub.normalize_membership_fee_amount(value numeric, normalization_context text) IS 'Normaliza cuotas unitarias de inscripción importadas (enrollments.fee_amount) según reglas por contexto; no debe usarse para totales agregados.';


--
-- Name: protect_finalized_movement(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.protect_finalized_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.reconciled_at IS NOT NULL
     OR miclub.movement_has_payment_allocation(OLD.id)
  THEN
    RAISE EXCEPTION
      'reconciled or payment-linked movement is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: record_exchange_rate_usage(uuid, text, text, jsonb); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.record_exchange_rate_usage(p_club_id uuid, p_usage_type text, p_usage_reference text, p_account_valuations jsonb) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  valuation jsonb;
  usage_id uuid;
  component_ids jsonb;
  inserted_count integer := 0;
BEGIN
  FOR valuation IN SELECT value FROM jsonb_array_elements(p_account_valuations) LOOP
    component_ids := coalesce(valuation->'exchangeRateIds',
      CASE WHEN valuation->>'exchangeRateId' IS NOT NULL
        THEN jsonb_build_array(valuation->>'exchangeRateId') ELSE '[]'::jsonb END);
    IF jsonb_array_length(component_ids) > 0 AND valuation->>'convertedBalance' IS NOT NULL THEN
      INSERT INTO miclub.exchange_rate_usages(exchange_rate_id,club_id,usage_type,usage_reference,amount,converted_amount)
      VALUES(CASE WHEN jsonb_array_length(component_ids)=1 THEN (component_ids->>0)::uuid END,
        p_club_id,p_usage_type,p_usage_reference||':'||(valuation->>'accountId'),
        (valuation->>'nominalBalance')::numeric,(valuation->>'convertedBalance')::numeric)
      ON CONFLICT (club_id,usage_type,usage_reference) DO NOTHING RETURNING id INTO usage_id;
      IF usage_id IS NOT NULL THEN
        INSERT INTO miclub.exchange_rate_usage_components(exchange_rate_usage_id,exchange_rate_id,component_order)
        SELECT usage_id,value::uuid,ordinality::smallint
        FROM jsonb_array_elements_text(component_ids) WITH ORDINALITY;
        inserted_count := inserted_count + 1;
      END IF;
    END IF;
    usage_id := NULL;
  END LOOP;
  RETURN inserted_count;
END $$;


--
-- Name: reject_exchange_rate_mutation(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.reject_exchange_rate_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN
  RAISE EXCEPTION 'exchange_rates are immutable; insert a new dated quote';
END $$;


--
-- Name: reject_financial_fact_delete(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.reject_financial_fact_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'physical deletion of %.% is forbidden; cancel or reverse the record', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;


--
-- Name: replace_opening_balances(uuid, text, numeric, numeric, numeric, text, uuid, text); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.replace_opening_balances(p_club_id uuid, p_currency_code text, p_cash numeric, p_bank numeric, p_usd_cash numeric, p_idempotency_key text, p_created_by uuid DEFAULT NULL::uuid, p_operation text DEFAULT 'REPLACE'::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE v_batch uuid; v_previous uuid; v_revision integer;
BEGIN
  IF p_currency_code IS NULL OR p_currency_code NOT IN ('ARS','USD','BRL','EUR') THEN
    RAISE EXCEPTION 'Moneda operativa no soportada';
  END IF;
  IF p_cash IS NULL OR p_bank IS NULL OR p_usd_cash IS NULL OR p_cash < 0 OR p_bank < 0 OR p_usd_cash < 0 THEN
    RAISE EXCEPTION 'Los saldos iniciales no pueden ser negativos';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'idempotency_key requerido'; END IF;
  IF p_operation NOT IN ('REPLACE','REVERSE') THEN RAISE EXCEPTION 'Operación inválida'; END IF;
  PERFORM 1 FROM miclub.clubs WHERE id=p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club inexistente'; END IF;
  SELECT id INTO v_batch FROM miclub.opening_balance_batches
   WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key;
  IF v_batch IS NOT NULL THEN RETURN v_batch; END IF;
  UPDATE miclub.clubs SET base_currency_code=p_currency_code,updated_at=now() WHERE id=p_club_id;
  INSERT INTO miclub.financial_accounts(club_id,code,name,currency_code)
  SELECT p_club_id, seed.code, seed.name, CASE WHEN seed.code='USD_CASH' THEN 'USD' ELSE p_currency_code END
  FROM (VALUES ('CASH','Caja'),('BANK','Banco'),('USD_CASH','Caja USD')) seed(code,name)
  ON CONFLICT (club_id,code) DO UPDATE SET name=excluded.name,currency_code=excluded.currency_code,updated_at=now();
  SELECT id INTO v_previous FROM miclub.opening_balance_batches
   WHERE club_id=p_club_id AND status='APPLIED' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
  SELECT coalesce(max(revision),0)+1 INTO v_revision FROM miclub.opening_balance_batches WHERE club_id=p_club_id;
  INSERT INTO miclub.opening_balance_batches(club_id,revision,operation,replaces_batch_id,idempotency_key,created_by,operational_currency_code)
  VALUES(p_club_id,v_revision,p_operation,v_previous,p_idempotency_key,p_created_by,p_currency_code) RETURNING id INTO v_batch;
  IF v_previous IS NOT NULL THEN
    UPDATE miclub.opening_balance_batches SET status='SUPERSEDED' WHERE id=v_previous;
    WITH reversed AS (
      INSERT INTO miclub.movements(club_id,movement_date,movement_type,concept,amount,currency_code,account_id,
        financial_status,operational_status,source,source_payload,created_by,idempotency_key)
      SELECT m.club_id,current_date,'CAPITAL','Reversión saldo inicial',-m.amount,m.currency_code,m.account_id,
        'pagado'::miclub.financial_status,'COMPLETADO','onboarding',jsonb_build_object('opening_balance',true,'operation','REVERSE','batch_id',v_batch),
        p_created_by,p_idempotency_key||':reverse:'||m.account_id
      FROM miclub.opening_balance_movements obm JOIN miclub.movements m ON m.id=obm.movement_id
      WHERE obm.batch_id=v_previous AND obm.reverses_movement_id IS NULL RETURNING id, account_id)
    INSERT INTO miclub.opening_balance_movements(movement_id,batch_id,reverses_movement_id)
    SELECT r.id,v_batch,old.movement_id FROM reversed r JOIN miclub.opening_balance_movements old
      ON old.batch_id=v_previous JOIN miclub.movements om ON om.id=old.movement_id AND om.account_id=r.account_id;
  END IF;
  WITH amounts(code,amount) AS (VALUES ('CASH',p_cash),('BANK',p_bank),('USD_CASH',p_usd_cash)), inserted AS (
    INSERT INTO miclub.movements(club_id,movement_date,movement_type,concept,amount,currency_code,account_id,
      financial_status,operational_status,source,source_payload,created_by,idempotency_key)
    SELECT p_club_id,current_date,'CAPITAL','Saldo inicial',x.amount,a.currency_code,a.id,
      'pagado'::miclub.financial_status,'COMPLETADO','onboarding',jsonb_build_object('opening_balance',true,'operation','REPLACE','batch_id',v_batch),
      p_created_by,p_idempotency_key||':'||a.code
    FROM amounts x JOIN miclub.financial_accounts a ON a.club_id=p_club_id AND a.code=x.code AND a.status='ACTIVE'
    RETURNING id)
  INSERT INTO miclub.opening_balance_movements(movement_id,batch_id) SELECT id,v_batch FROM inserted;
  IF (SELECT count(*) FROM miclub.opening_balance_movements WHERE batch_id=v_batch AND reverses_movement_id IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Se requieren las cuentas activas CASH, BANK y USD_CASH';
  END IF;
  UPDATE miclub.opening_balance_batches SET reconciliation_status='RECONCILED' WHERE id=v_batch;
  RETURN v_batch;
END $$;


--
-- Name: require_movement_category_catalog(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.require_movement_category_catalog() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.catalog_id is null then
    raise exception 'Las categorías nuevas requieren catalog_id canónico';
  end if;
  return new;
end $$;


--
-- Name: resolve_active_membership(uuid, uuid); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.resolve_active_membership(target_user_id uuid, target_membership_id uuid) RETURNS TABLE(membership_id uuid, club_id uuid, role_code text, permissions text[], sector_ids uuid[], session_revoked_before timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'miclub'
    AS $$
  SELECT membership.id, membership.club_id, role.code,
         membership.permissions, membership.sector_ids,
         app_user.session_revoked_before
    FROM miclub.user_club_memberships membership
    JOIN miclub.users app_user
      ON app_user.id = membership.user_id AND app_user.status = 'active'
    JOIN miclub.clubs club
      ON club.id = membership.club_id AND club.is_active = true
    JOIN miclub.roles role
      ON role.id = membership.role_id AND role.club_id = membership.club_id
   WHERE membership.user_id = target_user_id
     AND membership.id = target_membership_id
     AND membership.status = 'active'
$$;


--
-- Name: resolve_login_membership(uuid); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.resolve_login_membership(target_user_id uuid) RETURNS TABLE(membership_id uuid, club_id uuid, role_code text, permissions text[], sector_ids uuid[], person_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'miclub'
    AS $$
  SELECT membership.id, membership.club_id, role.code,
         membership.permissions, membership.sector_ids, person.id
    FROM miclub.user_club_memberships membership
    JOIN miclub.clubs club
      ON club.id = membership.club_id AND club.is_active = true
    JOIN miclub.roles role
      ON role.id = membership.role_id AND role.club_id = membership.club_id
    JOIN miclub.people person
      ON person.user_id = target_user_id AND person.club_id = membership.club_id
   WHERE membership.user_id = target_user_id
     AND membership.status = 'active'
   ORDER BY membership.created_at, membership.id
   LIMIT 1
$$;


--
-- Name: reverse_opening_balances(uuid, text, uuid); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.reverse_opening_balances(p_club_id uuid, p_idempotency_key text, p_created_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE sql
    AS $$
  SELECT miclub.replace_opening_balances(p_club_id,c.base_currency_code,0,0,0,p_idempotency_key,p_created_by,'REVERSE')
  FROM miclub.clubs c WHERE c.id=p_club_id
$$;


--
-- Name: sync_activity_enrollment_fee(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.sync_activity_enrollment_fee() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'miclub'
    AS $$
begin
  if new.monthly_fee is distinct from old.monthly_fee then
    update miclub.enrollments
       set fee_amount = new.monthly_fee, normalized_fee_amount = new.monthly_fee,
           fee_normalization_reason = 'activity_fee_sync', fee_normalized_at = now(), updated_at = now()
     where club_id = new.club_id and activity_id = new.id and status <> 'cancelado';
  end if;
  return new;
end $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_activity_mutation(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.validate_activity_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.club_commission_percent < 0 OR NEW.club_commission_percent > 100 THEN
    RAISE EXCEPTION 'club_commission_percent must be between 0 and 100' USING ERRCODE = '23514';
  END IF;
  IF NEW.status::text IN ('active', 'activa') AND NEW.instructor_id IS NULL THEN
    RAISE EXCEPTION 'active activity requires canonical instructor_id' USING ERRCODE = '23514';
  END IF;
  IF NEW.archived_at IS NOT NULL AND NEW.status::text NOT IN ('archived', 'cancelada') THEN
    RAISE EXCEPTION 'archived activity must have archived status' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: validate_activity_terms_contiguous(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.validate_activity_terms_contiguous() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_activity_id uuid := coalesce(NEW.activity_id, OLD.activity_id);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT effective_from,
             lag(effective_to) OVER (ORDER BY effective_from) AS previous_effective_to
      FROM miclub.activity_terms
      WHERE activity_id = target_activity_id
    ) versions
    WHERE previous_effective_to IS NOT NULL
      AND effective_from <> previous_effective_to + 1
  ) THEN
    RAISE EXCEPTION 'activity terms must be contiguous' USING ERRCODE = '23514';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;


--
-- Name: validate_employee_tenant_refs(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.validate_employee_tenant_refs() RETURNS trigger
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


--
-- Name: validate_movement_void(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.validate_movement_void() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN
 IF NEW.voided_at IS NOT NULL AND (NEW.operational_status::text <> 'ANULADO' OR NEW.void_reason IS NULL OR btrim(NEW.void_reason)='') THEN RAISE EXCEPTION 'void movement requires ANULADO status and reason' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;


--
-- Name: validate_tasks_and_approvals_tenant_refs(); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.validate_tasks_and_approvals_tenant_refs() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
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
END $_$;


--
-- Name: value_club_liquidity(uuid, date); Type: FUNCTION; Schema: miclub; Owner: -
--

CREATE FUNCTION miclub.value_club_liquidity(p_club_id uuid, p_cutoff_date date DEFAULT CURRENT_DATE) RETURNS TABLE(club_id uuid, cutoff_date date, presentation_currency_code text, valuation_status text, unvalued_account_count integer, missing_pairs jsonb, liquidity numeric, cash numeric, bank numeric, dollars numeric, dollars_converted numeric, account_valuations jsonb)
    LANGUAGE sql STABLE
    AS $$
WITH accounts AS (
  SELECT a.club_id, a.account_id, a.code, a.name, a.currency_code,
         a.balance AS nominal_balance, c.base_currency_code
  FROM miclub.v_financial_account_liquidity a
  JOIN miclub.clubs c ON c.id = a.club_id
  WHERE a.club_id = p_club_id
), quoted AS (
  SELECT a.*, r.id AS exchange_rate_id, r.rate, r.rate_date, r.source,
         CASE WHEN a.currency_code=a.base_currency_code THEN 'IDENTITY'
              WHEN r.base_currency_code=a.currency_code THEN 'DIRECT'
              WHEN r.id IS NOT NULL THEN 'INVERSE' END AS direction,
         CASE WHEN a.currency_code=a.base_currency_code THEN a.nominal_balance
              WHEN r.base_currency_code=a.currency_code THEN a.nominal_balance*r.rate
              WHEN r.id IS NOT NULL THEN a.nominal_balance/r.rate END AS converted_balance
  FROM accounts a
  LEFT JOIN LATERAL (
    SELECT er.* FROM miclub.exchange_rates er
    WHERE er.rate_type='official' AND er.rate_date <= p_cutoff_date
      AND er.rate_date >= p_cutoff_date - 4
      AND ((er.base_currency_code=a.currency_code AND er.quote_currency_code=a.base_currency_code)
        OR (er.base_currency_code=a.base_currency_code AND er.quote_currency_code=a.currency_code))
    ORDER BY er.rate_date DESC, er.fetched_at DESC, er.id
    LIMIT 1
  ) r ON a.currency_code<>a.base_currency_code
), aggregate AS (
  SELECT max(base_currency_code) AS currency_code,
    count(*) FILTER (WHERE converted_balance IS NULL)::integer AS missing_count,
    jsonb_agg(DISTINCT jsonb_build_object('baseCurrencyCode',currency_code,'quoteCurrencyCode',base_currency_code))
      FILTER (WHERE converted_balance IS NULL) AS missing,
    sum(converted_balance) AS complete_liquidity,
    sum(converted_balance) FILTER (WHERE code='CASH') AS cash_value,
    sum(converted_balance) FILTER (WHERE code='BANK') AS bank_value,
    sum(nominal_balance) FILTER (WHERE currency_code='USD') AS usd_nominal,
    sum(converted_balance) FILTER (WHERE currency_code='USD') AS usd_converted,
    jsonb_agg(jsonb_build_object(
      'accountId',account_id,'code',code,'name',name,'currencyCode',currency_code,
      'nominalBalance',nominal_balance,'usdNominalBalance',CASE WHEN currency_code='USD' THEN nominal_balance END,
      'convertedBalance',converted_balance,'exchangeRateId',exchange_rate_id,'rate',rate,
      'rateDate',rate_date,'source',source,'direction',direction
    ) ORDER BY code,account_id) AS details
  FROM quoted
)
SELECT p_club_id,p_cutoff_date,currency_code,
  CASE WHEN coalesce(missing_count,0)>0 THEN 'INCOMPLETE_EXCHANGE_RATE' ELSE 'COMPLETE' END,
  coalesce(missing_count,0),coalesce(missing,'[]'::jsonb),
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(complete_liquidity,0) END,
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(cash_value,0) END,
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(bank_value,0) END,
  coalesce(usd_nominal,0),
  CASE WHEN coalesce(missing_count,0)>0 THEN NULL ELSE coalesce(usd_converted,0) END,
  coalesce(details,'[]'::jsonb)
FROM aggregate;
$$;


--
-- Name: FUNCTION value_club_liquidity(p_club_id uuid, p_cutoff_date date); Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON FUNCTION miclub.value_club_liquidity(p_club_id uuid, p_cutoff_date date) IS 'Canonical live valuation. Recalculates official direct/inverse quotes at cutoff; quotes older than EXCHANGE_RATE_MAX_AGE_DAYS=4 are inadmissible.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector_id uuid NOT NULL,
    manager_person_id uuid,
    code text,
    name text NOT NULL,
    modality text,
    color text DEFAULT '#7DD3FC'::text NOT NULL,
    monthly_fee numeric(14,2),
    club_commission_percent numeric(6,2) DEFAULT 0 NOT NULL,
    instructor_commission_percent numeric(6,2) DEFAULT 0 NOT NULL,
    max_capacity integer,
    status miclub.entity_status DEFAULT 'activa'::miclub.entity_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    instructor_id uuid NOT NULL,
    club_id uuid NOT NULL,
    description text,
    generates_enrollments boolean DEFAULT true NOT NULL,
    settlement_mode text,
    settlement_fixed_amount numeric(14,2),
    settlement_category_id uuid,
    archived_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    icon_key text,
    enrollment_fee_frequency text,
    CONSTRAINT activities_enrollment_fee_frequency_check CHECK ((enrollment_fee_frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text, 'YEARLY'::text])))
);

ALTER TABLE ONLY miclub.activities FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE activities; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.activities IS 'Catálogo único de actividades. No crear tablas paralelas para modelar actividades.';


--
-- Name: COLUMN activities.manager_person_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.manager_person_id IS 'DEPRECATED: dato legado. El responsable canónico es instructor_id; debe derivarse de instructors.person_id durante la transición.';


--
-- Name: COLUMN activities.monthly_fee; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.monthly_fee IS 'LEGACY nullable: historical member enrollment fee. Not the FIXED settlement amount and not populated by activity/onboarding forms.';


--
-- Name: COLUMN activities.instructor_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.instructor_id IS 'Relación canónica y única con el responsable operativo de la actividad. manager_person_id es legado de lectura y no debe usarse en contratos nuevos.';


--
-- Name: COLUMN activities.club_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.club_id IS 'Tenant propietario de la actividad; debe coincidir con sector/personas/categorías relacionadas.';


--
-- Name: COLUMN activities.description; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.description IS 'Descripción funcional extendida de la actividad.';


--
-- Name: COLUMN activities.generates_enrollments; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.generates_enrollments IS 'Indica si la actividad genera inscripciones operativas.';


--
-- Name: COLUMN activities.settlement_mode; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.settlement_mode IS 'Modo de liquidación de la actividad; constraint NOT VALID hasta completar diagnóstico/backfill.';


--
-- Name: COLUMN activities.settlement_fixed_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.settlement_fixed_amount IS 'Monto fijo de liquidación cuando settlement_mode lo requiera.';


--
-- Name: COLUMN activities.settlement_category_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.settlement_category_id IS 'Categoría de movimiento asociada a la liquidación de la actividad.';


--
-- Name: COLUMN activities.archived_at; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.archived_at IS 'Fecha/hora de archivado lógico; NULL indica actividad no archivada.';


--
-- Name: COLUMN activities.created_by; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.created_by IS 'Persona/usuario que creó la actividad, nullable hasta completar trazabilidad.';


--
-- Name: COLUMN activities.updated_by; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.updated_by IS 'Actor de la última mutación administrativa; las mutaciones requieren que esta migración figure aplicada.';


--
-- Name: COLUMN activities.enrollment_fee_frequency; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activities.enrollment_fee_frequency IS 'LEGACY nullable: frequency associated only with activities.monthly_fee; not a settlement frequency.';


--
-- Name: activity_fee_cleanup_candidates; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_fee_cleanup_candidates (
    activity_id uuid NOT NULL,
    activity_monthly_fee numeric(14,2) NOT NULL,
    max_normalized_enrollment_fee numeric(14,2) CONSTRAINT activity_fee_cleanup_candid_max_normalized_enrollment__not_null NOT NULL,
    active_enrollments_count integer CONSTRAINT activity_fee_cleanup_candidat_active_enrollments_count_not_null NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: TABLE activity_fee_cleanup_candidates; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.activity_fee_cleanup_candidates IS 'Actividades cuya cuota mensual es mayor que las cuotas normalizadas actuales de sus inscripciones activas; revisar antes de corregir.';


--
-- Name: activity_fee_history; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_fee_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    previous_monthly_fee numeric(14,2),
    new_monthly_fee numeric(14,2) NOT NULL,
    source text DEFAULT 'google_sheets_import'::text NOT NULL,
    raw_fee_amount_text text,
    raw_fee_amount numeric(14,2),
    normalization_reason text,
    import_batch_id uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: TABLE activity_fee_history; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.activity_fee_history IS 'Audita cambios de cuota mensual de actividades, especialmente correcciones de importes normalizados desde Google Sheets.';


--
-- Name: COLUMN activity_fee_history.previous_monthly_fee; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activity_fee_history.previous_monthly_fee IS 'Cuota mensual anterior de miclub.activities.monthly_fee.';


--
-- Name: COLUMN activity_fee_history.new_monthly_fee; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activity_fee_history.new_monthly_fee IS 'Nueva cuota mensual aplicada a miclub.activities.monthly_fee.';


--
-- Name: COLUMN activity_fee_history.normalization_reason; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activity_fee_history.normalization_reason IS 'Razon de normalizacion usada por el importador para aceptar la cuota nueva.';


--
-- Name: activity_icon_aliases; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_icon_aliases (
    alias_key text NOT NULL,
    icon_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_icon_catalog; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_icon_catalog (
    icon_key text NOT NULL,
    display_name text NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    glyph text,
    category text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: activity_schedules; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    room_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_schedules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: activity_settlement_allocations; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_settlement_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    settlement_id uuid NOT NULL,
    movement_id uuid,
    allocation_type text NOT NULL,
    amount numeric(14,2) NOT NULL,
    status text DEFAULT 'PENDIENTE'::text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    voided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_settlement_allocations_allocation_type_check CHECK ((allocation_type = ANY (ARRAY['PAYMENT'::text, 'ADVANCE'::text, 'SETTLEMENT_ADJUSTMENT'::text]))),
    CONSTRAINT activity_settlement_allocations_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT activity_settlement_allocations_status_check CHECK ((status = ANY (ARRAY['PENDIENTE'::text, 'COMPLETADO'::text, 'CANCELADO'::text])))
);


--
-- Name: TABLE activity_settlement_allocations; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.activity_settlement_allocations IS 'Asignaciones explícitas; PAYMENT, ADVANCE y SETTLEMENT_ADJUSTMENT nunca se infieren del nombre de un movimiento.';


--
-- Name: activity_settlements; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    activity_term_id uuid NOT NULL,
    period_from date NOT NULL,
    period_to date NOT NULL,
    status text DEFAULT 'PENDIENTE'::text NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    voided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_settlements_period_check CHECK ((period_to >= period_from)),
    CONSTRAINT activity_settlements_status_check CHECK ((status = ANY (ARRAY['PENDIENTE'::text, 'COMPLETADO'::text, 'CANCELADO'::text])))
);


--
-- Name: COLUMN activity_settlements.status; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activity_settlements.status IS 'Sólo COMPLETADO y no anulado participa de saldos ordinarios.';


--
-- Name: COLUMN activity_settlements.calculated_at; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activity_settlements.calculated_at IS 'Fecha obligatoria del cálculo cacheado; todo consumidor debe reconciliar el registro contra movimientos y asignaciones fuente.';


--
-- Name: activity_terms; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    mode text NOT NULL,
    monthly_fixed_fee numeric(14,2),
    club_share_percentage numeric(7,4),
    effective_from date NOT NULL,
    effective_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    fixed_club_fee numeric(14,2),
    fixed_fee_frequency text,
    currency_code text,
    CONSTRAINT activity_terms_dates_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT activity_terms_fixed_fee_frequency_check CHECK ((fixed_fee_frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text, 'YEARLY'::text]))),
    CONSTRAINT activity_terms_mode_check CHECK ((mode = ANY (ARRAY['FIXED'::text, 'VARIABLE'::text]))),
    CONSTRAINT activity_terms_mode_currency_check CHECK ((((mode = 'FIXED'::text) AND (currency_code IS NOT NULL)) OR ((mode = 'VARIABLE'::text) AND (currency_code IS NULL)))),
    CONSTRAINT activity_terms_values_check CHECK ((((mode = 'VARIABLE'::text) AND ((club_share_percentage >= (0)::numeric) AND (club_share_percentage <= (100)::numeric)) AND (fixed_club_fee IS NULL) AND (fixed_fee_frequency IS NULL)) OR ((mode = 'FIXED'::text) AND (fixed_club_fee >= (0)::numeric) AND (fixed_fee_frequency IS NOT NULL) AND (club_share_percentage IS NULL))))
);


--
-- Name: COLUMN activity_terms.currency_code; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.activity_terms.currency_code IS 'Moneda histórica de fixed_club_fee. Es obligatoria para FIXED y NULL por convención para VARIABLE; cada cambio se registra en una nueva versión del término.';


--
-- Name: activity_terms_migration_diagnostic; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.activity_terms_migration_diagnostic (
    activity_id uuid NOT NULL,
    club_id uuid NOT NULL,
    legacy_settlement_mode text,
    legacy_fixed_amount numeric(14,2),
    legacy_club_percentage numeric(7,4),
    proposed_mode text,
    diagnosis text NOT NULL,
    diagnosed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_sessions; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.app_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    membership_id uuid,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: approval_requests; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by_user_id uuid,
    requested_by_membership_id uuid,
    assigned_to_user_id uuid,
    assigned_to_membership_id uuid,
    decided_by_user_id uuid,
    decided_by_membership_id uuid,
    target_entity_type text,
    target_entity_id uuid,
    decision_reason text,
    decided_at timestamp with time zone,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT approval_requests_archived_status_check CHECK (((archived_at IS NULL) OR (status = 'archived'::text))),
    CONSTRAINT approval_requests_decision_status_check CHECK ((((decided_at IS NULL) AND (decided_by_user_id IS NULL) AND (decided_by_membership_id IS NULL)) OR (status = ANY (ARRAY['approved'::text, 'rejected'::text])))),
    CONSTRAINT approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text, 'archived'::text]))),
    CONSTRAINT approval_requests_title_not_blank_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE approval_requests; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.approval_requests IS 'Solicitudes de aprobación por club; registra decisión y responsable sin ejecutar payloads JSON arbitrarios.';


--
-- Name: COLUMN approval_requests.metadata; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.approval_requests.metadata IS 'Metadatos descriptivos sanitizados; no debe contener credenciales ni instrucciones ejecutables.';


--
-- Name: audit_log; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid,
    membership_id uuid,
    ip inet,
    user_agent text,
    request_id text,
    result text DEFAULT 'success'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT audit_log_result_check CHECK ((result = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text])))
);


--
-- Name: COLUMN audit_log.result; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.audit_log.result IS 'Resultado normalizado del evento: success, failure o denied.';


--
-- Name: COLUMN audit_log.metadata; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.audit_log.metadata IS 'Contexto adicional sanitizado; nunca debe contener credenciales, tokens, cookies ni secretos.';


--
-- Name: billing_payment_confirmations; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.billing_payment_confirmations (
    gateway_event_id text NOT NULL,
    club_id uuid NOT NULL,
    subscription_id bigint NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_payment_confirmations_gateway_event_id_check CHECK (((length(gateway_event_id) >= 1) AND (length(gateway_event_id) <= 255)))
);

ALTER TABLE ONLY miclub.billing_payment_confirmations FORCE ROW LEVEL SECURITY;


--
-- Name: category_catalog; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.category_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    classification text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_catalog_classification_check CHECK ((classification = ANY (ARRAY['OPERATIONAL'::text, 'NON_OPERATIONAL'::text, 'TAX'::text, 'SERVICE'::text, 'LIABILITY'::text]))),
    CONSTRAINT category_catalog_code_check CHECK (((code = upper(code)) AND (code ~ '^[A-Z0-9_]+$'::text))),
    CONSTRAINT category_catalog_display_order_check CHECK ((display_order > 0))
);


--
-- Name: category_import_aliases; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.category_import_aliases (
    normalized_alias text NOT NULL,
    catalog_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_import_aliases_normalized_alias_check CHECK ((normalized_alias = upper(normalized_alias)))
);


--
-- Name: club_capabilities; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.club_capabilities (
    club_id uuid NOT NULL,
    capability text NOT NULL,
    source text NOT NULL,
    effective_from timestamp with time zone NOT NULL,
    effective_until timestamp with time zone,
    actor text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    legacy_permanent boolean DEFAULT false NOT NULL,
    reason text DEFAULT 'legacy capability grant'::text NOT NULL,
    CONSTRAINT club_capabilities_actor_check CHECK ((btrim(actor) <> ''::text)),
    CONSTRAINT club_capabilities_capability_check CHECK ((capability = 'DATA_MIGRATION'::text)),
    CONSTRAINT club_capabilities_check CHECK (((effective_until IS NULL) OR (effective_until > effective_from))),
    CONSTRAINT club_capabilities_new_overrides_expire CHECK ((legacy_permanent OR (effective_until IS NOT NULL))),
    CONSTRAINT club_capabilities_reason_check CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT club_capabilities_source_check CHECK ((btrim(source) <> ''::text))
);


--
-- Name: TABLE club_capabilities; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.club_capabilities IS 'Append-only, auditable and temporary feature overrides; never a billing or subscription record.';


--
-- Name: COLUMN club_capabilities.effective_until; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.club_capabilities.effective_until IS 'Override expiry. New overrides must be temporary; legacy NULL grants remain compatible during rollout.';


--
-- Name: club_capabilities_id_seq; Type: SEQUENCE; Schema: miclub; Owner: -
--

ALTER TABLE miclub.club_capabilities ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME miclub.club_capabilities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: club_memberships; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.club_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    person_id uuid NOT NULL,
    membership_number text,
    status text DEFAULT 'active'::text,
    joined_at timestamp with time zone,
    ended_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY miclub.club_memberships FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE club_memberships; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.club_memberships IS 'Links people to club tenants. Phase 1 does not backfill memberships or require one for existing tenant-scoped records.';


--
-- Name: COLUMN club_memberships.membership_number; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.club_memberships.membership_number IS 'Optional club-local membership identifier.';


--
-- Name: club_onboarding; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.club_onboarding (
    club_id uuid NOT NULL,
    status text DEFAULT 'NOT_STARTED'::text NOT NULL,
    current_step smallint DEFAULT 1 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_steps smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    skipped_steps smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    CONSTRAINT club_onboarding_completed_steps_check CHECK ((completed_steps <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])),
    CONSTRAINT club_onboarding_current_step_check CHECK (((current_step >= 1) AND (current_step <= 7))),
    CONSTRAINT club_onboarding_skipped_steps_check CHECK (((skipped_steps <@ ARRAY[(2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]) AND (NOT (completed_steps && skipped_steps)))),
    CONSTRAINT club_onboarding_status_check CHECK ((status = ANY (ARRAY['NOT_STARTED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text])))
);


--
-- Name: club_subscriptions; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.club_subscriptions (
    id bigint NOT NULL,
    club_id uuid NOT NULL,
    plan_code text NOT NULL,
    effective_from timestamp with time zone NOT NULL,
    effective_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_status text DEFAULT 'active'::text NOT NULL,
    selection_mode text DEFAULT 'disabled'::text NOT NULL,
    selection_source text DEFAULT 'legacy'::text NOT NULL,
    CONSTRAINT club_subscriptions_billing_status_check CHECK ((billing_status = ANY (ARRAY['active'::text, 'pending_payment'::text, 'cancelled'::text]))),
    CONSTRAINT club_subscriptions_check CHECK (((effective_until IS NULL) OR (effective_until > effective_from))),
    CONSTRAINT club_subscriptions_selection_mode_check CHECK ((selection_mode = ANY (ARRAY['disabled'::text, 'sandbox'::text, 'live'::text]))),
    CONSTRAINT club_subscriptions_selection_source_check CHECK ((selection_source = ANY (ARRAY['legacy'::text, 'free'::text, 'sandbox_onboarding'::text, 'future_gateway'::text, 'authenticated_gateway_confirmation'::text, 'pre_billing_onboarding'::text])))
);


--
-- Name: COLUMN club_subscriptions.billing_status; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.club_subscriptions.billing_status IS 'Billing lifecycle. pending_payment reserves a future checkout without granting entitlements.';


--
-- Name: COLUMN club_subscriptions.selection_source; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.club_subscriptions.selection_source IS 'Auditable origin. pre_billing_onboarding activates any commercial plan without collecting payment; gateway values are reserved for future billing.';


--
-- Name: club_subscriptions_id_seq; Type: SEQUENCE; Schema: miclub; Owner: -
--

ALTER TABLE miclub.club_subscriptions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME miclub.club_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clubs; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.clubs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    name text,
    legal_name text,
    tax_id text,
    email text,
    phone text,
    address text,
    timezone text,
    settings jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    base_currency_code text DEFAULT 'ARS'::text NOT NULL,
    CONSTRAINT clubs_settings_non_relational_check CHECK ((NOT (COALESCE(settings, '{}'::jsonb) ?| ARRAY['onboarding'::text, 'openingBalances'::text, 'opening_balances'::text, 'operationalBalances'::text, 'operational_balances'::text, 'currency'::text])))
);


--
-- Name: TABLE clubs; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.clubs IS 'Club tenants available in the MiClub schema. Phase 1 only creates the catalog; existing rows in other tables may keep club_id null.';


--
-- Name: COLUMN clubs.code; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.clubs.code IS 'Optional stable tenant code used by imports, integrations, or routing.';


--
-- Name: COLUMN clubs.settings; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.clubs.settings IS 'Configuración tenant sin modelo relacional propio; onboarding, cuentas y saldos están prohibidos.';


--
-- Name: crm_message_history; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.crm_message_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid,
    enrollment_id uuid,
    template_id text,
    phone text NOT NULL,
    message text NOT NULL,
    wa_link text NOT NULL,
    status miclub.message_status DEFAULT 'prepared'::miclub.message_status NOT NULL,
    opened_at timestamp with time zone,
    sent_at timestamp with time zone,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    legacy_sqlite_id integer NOT NULL,
    member_id text NOT NULL,
    nombre text,
    template_name text
);

ALTER TABLE ONLY miclub.crm_message_history FORCE ROW LEVEL SECURITY;


--
-- Name: crm_message_history_legacy_id_seq; Type: SEQUENCE; Schema: miclub; Owner: -
--

CREATE SEQUENCE miclub.crm_message_history_legacy_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_message_history_legacy_id_seq; Type: SEQUENCE OWNED BY; Schema: miclub; Owner: -
--

ALTER SEQUENCE miclub.crm_message_history_legacy_id_seq OWNED BY miclub.crm_message_history.legacy_sqlite_id;


--
-- Name: crm_message_templates; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.crm_message_templates (
    id text NOT NULL,
    name text NOT NULL,
    body text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    legacy_sqlite_id text,
    archived_at timestamp with time zone,
    archived_by uuid
);

ALTER TABLE ONLY miclub.crm_message_templates FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN crm_message_templates.archived_at; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.crm_message_templates.archived_at IS 'Baja lógica reversible; las plantillas CRM no se eliminan físicamente desde la API.';


--
-- Name: currencies; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.currencies (
    code text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL
);


--
-- Name: discount_rates; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.discount_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    percent numeric(6,4) NOT NULL,
    label text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: employee_photos; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.employee_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    employee_id uuid,
    object_key text NOT NULL,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL,
    checksum_sha256 text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    status text DEFAULT 'temporary'::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT employee_photos_byte_size_check CHECK (((byte_size >= 1) AND (byte_size <= 5242880))),
    CONSTRAINT employee_photos_check CHECK ((((status = 'temporary'::text) AND (employee_id IS NULL) AND (expires_at IS NOT NULL)) OR ((status <> 'temporary'::text) AND ((status = 'deleted'::text) OR (employee_id IS NOT NULL))))),
    CONSTRAINT employee_photos_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT employee_photos_height_check CHECK (((height >= 1) AND (height <= 4096))),
    CONSTRAINT employee_photos_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT employee_photos_status_check CHECK ((status = ANY (ARRAY['temporary'::text, 'active'::text, 'deleted'::text]))),
    CONSTRAINT employee_photos_width_check CHECK (((width >= 1) AND (width <= 4096)))
);

ALTER TABLE ONLY miclub.employee_photos FORCE ROW LEVEL SECURITY;


--
-- Name: employees; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    person_id uuid NOT NULL,
    user_id uuid,
    membership_id uuid,
    sector_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    salary numeric(14,2),
    employment_start_date date,
    employment_end_date date,
    "position" text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    payment_mode text NOT NULL,
    monthly_fixed_amount numeric(14,2),
    has_fixed_compensation boolean DEFAULT false NOT NULL,
    fixed_compensation_amount numeric(14,2),
    fixed_compensation_frequency text,
    currency_code text,
    CONSTRAINT employees_archived_status_check CHECK (((archived_at IS NULL) OR (status = 'archived'::text))),
    CONSTRAINT employees_employment_dates_check CHECK (((employment_end_date IS NULL) OR (employment_start_date IS NULL) OR (employment_end_date >= employment_start_date))),
    CONSTRAINT employees_fixed_compensation_check CHECK (((has_fixed_compensation AND (fixed_compensation_amount IS NOT NULL) AND (fixed_compensation_amount >= (0)::numeric) AND (fixed_compensation_frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text, 'YEARLY'::text]))) OR ((NOT has_fixed_compensation) AND (fixed_compensation_amount IS NULL) AND (fixed_compensation_frequency IS NULL)))),
    CONSTRAINT employees_fixed_compensation_currency_check CHECK (((has_fixed_compensation AND (currency_code IS NOT NULL)) OR ((NOT has_fixed_compensation) AND (currency_code IS NULL)))),
    CONSTRAINT employees_payment_mode_amount_check CHECK ((((payment_mode = 'FIXED'::text) AND (monthly_fixed_amount IS NOT NULL) AND (monthly_fixed_amount >= (0)::numeric)) OR ((payment_mode = 'VARIABLE'::text) AND (monthly_fixed_amount IS NULL)))),
    CONSTRAINT employees_salary_check CHECK (((salary IS NULL) OR (salary >= (0)::numeric))),
    CONSTRAINT employees_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'on_leave'::text, 'terminated'::text, 'archived'::text])))
);


--
-- Name: TABLE employees; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.employees IS 'Datos laborales de empleados por club; no duplica datos personales, usa person_id hacia miclub.people.';


--
-- Name: COLUMN employees.person_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.person_id IS 'Referencia al perfil personal tenant-local en miclub.people; nombres, DNI, email y teléfono no se duplican aquí.';


--
-- Name: COLUMN employees.user_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.user_id IS 'Cuenta global opcional para empleados con acceso al sistema.';


--
-- Name: COLUMN employees.membership_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.membership_id IS 'Membresía/rol opcional en el club para autorización de la cuenta vinculada.';


--
-- Name: COLUMN employees.sector_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.sector_id IS 'Sector operativo principal opcional del empleado.';


--
-- Name: COLUMN employees.salary; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.salary IS 'COMPATIBILIDAD TEMPORAL: no escribir; retirar solo después de migrar todos los lectores.';


--
-- Name: COLUMN employees.payment_mode; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.payment_mode IS 'Modalidad de pago laboral: FIXED o VARIABLE.';


--
-- Name: COLUMN employees.monthly_fixed_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.monthly_fixed_amount IS 'Monto mensual no negativo, obligatorio solo para FIXED y nulo para VARIABLE.';


--
-- Name: COLUMN employees.has_fixed_compensation; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.has_fixed_compensation IS 'Whether this employee has personal base compensation; unrelated to activity terms or commissions.';


--
-- Name: COLUMN employees.fixed_compensation_frequency; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.fixed_compensation_frequency IS 'Canonical cadence: DAILY, WEEKLY, MONTHLY or YEARLY.';


--
-- Name: COLUMN employees.currency_code; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.employees.currency_code IS 'Moneda explícita de fixed_compensation_amount; NULL cuando no hay remuneración fija. Para clubes sin lote de onboarding el backfill usa clubs.base_currency_code.';


--
-- Name: enrollment_fee_audit; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.enrollment_fee_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_batch_id uuid,
    enrollment_id uuid,
    source_sheet text NOT NULL,
    source_row_number integer NOT NULL,
    raw_fee_text text,
    parsed_fee_amount numeric(14,2),
    normalized_fee_amount numeric(14,2) DEFAULT 0 NOT NULL,
    normalization_factor numeric(14,6),
    normalization_reason text NOT NULL,
    commission_rate numeric(8,6) DEFAULT 0 NOT NULL,
    receivable_fee numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: TABLE enrollment_fee_audit; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.enrollment_fee_audit IS 'Auditoria por importacion de la normalizacion de cuotas y calculo de comision/cuenta a cobrar.';


--
-- Name: enrollments; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    person_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    fee_amount numeric(14,2) DEFAULT 0 NOT NULL,
    status miclub.enrollment_status DEFAULT 'nuevo_inscripto'::miclub.enrollment_status NOT NULL,
    last_payment_at timestamp with time zone,
    due_date date,
    source text DEFAULT 'app'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    inactive boolean DEFAULT false NOT NULL,
    inactive_reason text,
    inactive_at timestamp with time zone,
    superseded_at timestamp with time zone,
    superseded_reason text,
    raw_fee_amount_text text,
    raw_fee_amount numeric(14,2),
    normalized_fee_amount numeric(14,2),
    fee_normalization_reason text,
    fee_normalized_at timestamp with time zone,
    enrollment_date date,
    missing_from_import_batch_id uuid,
    club_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    modality text,
    status_override boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY miclub.enrollments FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN enrollments.fee_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.fee_amount IS 'Compatibilidad temporal. Los calculos de cuotas a cobrar deben leer normalized_fee_amount.';


--
-- Name: COLUMN enrollments.raw_fee_amount_text; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.raw_fee_amount_text IS 'Valor original de cuota recibido desde la hoja antes de parsear/normalizar.';


--
-- Name: COLUMN enrollments.raw_fee_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.raw_fee_amount IS 'Valor numerico parseado desde raw_fee_amount_text antes de normalizar escala.';


--
-- Name: COLUMN enrollments.normalized_fee_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.normalized_fee_amount IS 'Cuota unitaria normalizada que debe usarse para calcular cuotas a cobrar.';


--
-- Name: COLUMN enrollments.fee_normalization_reason; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.fee_normalization_reason IS 'Razon de la normalizacion aplicada a raw_fee_amount.';


--
-- Name: COLUMN enrollments.fee_normalized_at; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.fee_normalized_at IS 'Fecha/hora en que se calculo normalized_fee_amount.';


--
-- Name: COLUMN enrollments.club_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';


--
-- Name: COLUMN enrollments.modality; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.modality IS 'Free text belonging to this enrollment; it is not activity identity.';


--
-- Name: COLUMN enrollments.status_override; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.enrollments.status_override IS 'When true, effective status remains the stored status until an operator clears the override.';


--
-- Name: exchange_rate_sync_state; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.exchange_rate_sync_state (
    source text NOT NULL,
    last_attempt_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exchange_rate_usage_components; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.exchange_rate_usage_components (
    exchange_rate_usage_id uuid NOT NULL,
    exchange_rate_id uuid NOT NULL,
    component_order smallint NOT NULL,
    CONSTRAINT exchange_rate_usage_components_component_order_check CHECK ((component_order > 0))
);


--
-- Name: exchange_rate_usages; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.exchange_rate_usages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exchange_rate_id uuid,
    club_id uuid NOT NULL,
    usage_type text NOT NULL,
    usage_reference text NOT NULL,
    amount numeric(30,8) NOT NULL,
    converted_amount numeric(30,8) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exchange_rates; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    base_currency_code text NOT NULL,
    quote_currency_code text NOT NULL,
    rate numeric(30,12) NOT NULL,
    rate_date date NOT NULL,
    rate_type text NOT NULL,
    source text NOT NULL,
    source_reference text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_distinct_currencies CHECK ((base_currency_code <> quote_currency_code)),
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric))
);


--
-- Name: features; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.features (
    code text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT features_code_check CHECK (((code = upper(code)) AND (btrim(code) <> ''::text))),
    CONSTRAINT features_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: financial_accounts; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.financial_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    currency_code text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_accounts_code_format CHECK (((code = upper(code)) AND (code ~ '^[A-Z][A-Z0-9_]*$'::text))),
    CONSTRAINT financial_accounts_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])))
);


--
-- Name: import_amount_normalization_rules; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.import_amount_normalization_rules (
    context text NOT NULL,
    min_valid_amount numeric NOT NULL,
    max_valid_amount numeric NOT NULL,
    scale_factor numeric NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_amount_normalization_rules_amounts_chk CHECK (((min_valid_amount >= (0)::numeric) AND (max_valid_amount >= min_valid_amount) AND (scale_factor > (1)::numeric)))
);


--
-- Name: TABLE import_amount_normalization_rules; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.import_amount_normalization_rules IS 'Reglas configurables para normalizar importes importados por contexto.';


--
-- Name: COLUMN import_amount_normalization_rules.context; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_amount_normalization_rules.context IS 'Contexto de normalización. membership_fee_unit aplica solo a enrollments.fee_amount (cuota unitaria de inscripción).';


--
-- Name: COLUMN import_amount_normalization_rules.min_valid_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_amount_normalization_rules.min_valid_amount IS 'Importe mínimo válido para el contexto luego de normalizar.';


--
-- Name: COLUMN import_amount_normalization_rules.max_valid_amount; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_amount_normalization_rules.max_valid_amount IS 'Importe máximo válido para el contexto antes/después de normalizar; valores dentro de este rango no se escalan.';


--
-- Name: COLUMN import_amount_normalization_rules.scale_factor; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_amount_normalization_rules.scale_factor IS 'Factor usado para corregir importes importados con escala extra cuando exceden el rango válido.';


--
-- Name: COLUMN import_amount_normalization_rules.enabled; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_amount_normalization_rules.enabled IS 'Permite activar/desactivar la regla sin modificar la función.';


--
-- Name: import_batches; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    source_file text,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    notes text,
    club_id uuid NOT NULL,
    file_sha256 text,
    template_version text,
    uploaded_by uuid,
    dry_run_of_batch_id uuid,
    row_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    projected_writes integer DEFAULT 0 NOT NULL,
    persisted_writes integer DEFAULT 0 NOT NULL,
    idempotency_key text,
    reference_config_hash text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    batch_identity text,
    operation_type text,
    onboarding_completion_key text,
    CONSTRAINT import_batches_operation_type_check CHECK (((operation_type IS NULL) OR (operation_type = ANY (ARRAY['dry_run'::text, 'apply'::text, 'retry'::text, 'reversal'::text]))))
);

ALTER TABLE ONLY miclub.import_batches FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN import_batches.uploaded_by; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_batches.uploaded_by IS 'Usuario que cargó el XLSX; referencia miclub.users y se conserva nula si la cuenta se elimina.';


--
-- Name: COLUMN import_batches.dry_run_of_batch_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_batches.dry_run_of_batch_id IS 'Dry-run exitoso y equivalente que autorizó este import real.';


--
-- Name: COLUMN import_batches.batch_identity; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_batches.batch_identity IS 'SHA-256 sobre hash del archivo, versión de plantilla, tenant y tipo de operación.';


--
-- Name: COLUMN import_batches.operation_type; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.import_batches.operation_type IS 'Distingue dry-run, aplicación real y las operaciones explícitas retry/reversal.';


--
-- Name: import_errors; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.import_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid,
    source_table text,
    source_row text,
    error_message text NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    error_code text,
    sheet text,
    entity_type text,
    field text,
    value_normalized text
);

ALTER TABLE ONLY miclub.import_errors FORCE ROW LEVEL SECURITY;


--
-- Name: instructors; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.instructors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid NOT NULL,
    display_name text NOT NULL,
    status miclub.entity_status DEFAULT 'activa'::miclub.entity_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: movement_categories; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.movement_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    catalog_id uuid,
    direction miclub.movement_type
);


--
-- Name: TABLE movement_categories; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.movement_categories IS 'Catálogo único y neutro de categorías económicas. El tipo del movimiento se define exclusivamente en movements.movement_type.';


--
-- Name: movements; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    movement_date timestamp with time zone DEFAULT now() NOT NULL,
    movement_type miclub.movement_type NOT NULL,
    category_id uuid,
    sector_id uuid,
    concept text NOT NULL,
    counterparty_person_id uuid,
    counterparty_text text,
    amount numeric(14,2) NOT NULL,
    taxes numeric(14,2) DEFAULT 0 NOT NULL,
    currency_code text DEFAULT 'ARS'::text NOT NULL,
    payment_method_id uuid,
    financial_status miclub.financial_status,
    operational_status miclub.movement_status DEFAULT 'COMPLETADO'::miclub.movement_status NOT NULL,
    source text DEFAULT 'app'::text NOT NULL,
    source_payload jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    person_id uuid,
    club_id uuid NOT NULL,
    activity_id uuid,
    reconciled_at timestamp with time zone,
    voided_at timestamp with time zone,
    voided_by uuid,
    void_reason text,
    idempotency_key text,
    account_id uuid,
    sequence_number bigint NOT NULL,
    CONSTRAINT movements_amount_check CHECK ((amount >= (0)::numeric))
);

ALTER TABLE ONLY miclub.movements FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN movements.payment_method_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.movements.payment_method_id IS 'Canal o medio de pago; no representa la cuenta financiera/contable.';


--
-- Name: COLUMN movements.club_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.movements.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';


--
-- Name: COLUMN movements.activity_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.movements.activity_id IS 'Actividad asociada explícitamente al movimiento. Nullable para preservar históricos; no backfillear por texto.';


--
-- Name: COLUMN movements.account_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.movements.account_id IS 'Cuenta financiera afectada; distinta del canal payment_method_id.';


--
-- Name: onboarding_operations; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.onboarding_operations (
    club_id uuid NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    contract_version integer NOT NULL,
    result jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT onboarding_operations_contract_version_check CHECK ((contract_version > 0)),
    CONSTRAINT onboarding_operations_idempotency_key_check CHECK (((length(idempotency_key) >= 8) AND (length(idempotency_key) <= 128))),
    CONSTRAINT onboarding_operations_operation_check CHECK ((operation = 'COMPLETE_ONBOARDING'::text))
);

ALTER TABLE ONLY miclub.onboarding_operations FORCE ROW LEVEL SECURITY;


--
-- Name: opening_balance_batches; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.opening_balance_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    revision integer NOT NULL,
    operation text NOT NULL,
    status text DEFAULT 'APPLIED'::text NOT NULL,
    replaces_batch_id uuid,
    reconciliation_status text DEFAULT 'PENDING'::text NOT NULL,
    idempotency_key text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    operational_currency_code text NOT NULL,
    CONSTRAINT opening_balance_batches_operation_check CHECK ((operation = ANY (ARRAY['REPLACE'::text, 'REVERSE'::text]))),
    CONSTRAINT opening_balance_batches_reconciliation_status_check CHECK ((reconciliation_status = ANY (ARRAY['PENDING'::text, 'RECONCILED'::text]))),
    CONSTRAINT opening_balance_batches_revision_check CHECK ((revision > 0)),
    CONSTRAINT opening_balance_batches_status_check CHECK ((status = ANY (ARRAY['APPLIED'::text, 'SUPERSEDED'::text, 'REVERSED'::text])))
);


--
-- Name: opening_balance_movements; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.opening_balance_movements (
    movement_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    reverses_movement_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operational_balances; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.operational_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector_id uuid,
    label text DEFAULT 'Saldos operativos'::text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    currency_code text DEFAULT 'ARS'::text NOT NULL,
    balance_date date DEFAULT CURRENT_DATE NOT NULL,
    source text DEFAULT 'app'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cutoff_date date DEFAULT CURRENT_DATE NOT NULL,
    liquidity numeric(14,2) DEFAULT 0 NOT NULL,
    cash numeric(14,2) DEFAULT 0 NOT NULL,
    bank numeric(14,2) DEFAULT 0 NOT NULL,
    dollars numeric(14,2) DEFAULT 0 NOT NULL,
    source_payload jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: TABLE operational_balances; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.operational_balances IS 'Snapshot/cache reconciliable. La autoridad de liquidez es v_financial_account_liquidity.';


--
-- Name: payment_allocations; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.payment_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    receivable_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    CONSTRAINT payment_allocations_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: payment_methods; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    movement_id uuid,
    person_id uuid,
    payment_method_id uuid,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency_code text DEFAULT 'ARS'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: people; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    dni text,
    phone text,
    normalized_phone text,
    email public.citext,
    status miclub.person_status DEFAULT 'activa'::miclub.person_status NOT NULL,
    notes text,
    birth_date date,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    user_id uuid,
    normalized_dni text GENERATED ALWAYS AS (NULLIF(regexp_replace(dni, '[^0-9]'::text, ''::text, 'g'::text), ''::text)) STORED
);

ALTER TABLE ONLY miclub.people FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN people.club_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.people.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';


--
-- Name: COLUMN people.user_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.people.user_id IS 'Vínculo opcional del perfil privado del club con una identidad global en miclub.users.';


--
-- Name: COLUMN people.normalized_dni; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.people.normalized_dni IS 'DNI canónico (solo dígitos), derivado de dni y único dentro del club.';


--
-- Name: person_kind_links; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.person_kind_links (
    person_id uuid NOT NULL,
    kind miclub.person_kind NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: plan_entitlements; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.plan_entitlements (
    plan_code text NOT NULL,
    feature_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.plans (
    code text NOT NULL,
    name text NOT NULL,
    catalog_status text NOT NULL,
    is_development boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    commercial_class text NOT NULL,
    description text,
    target_audience text,
    highlighted_features text[],
    display_order integer,
    recommended boolean DEFAULT false NOT NULL,
    cta_text text,
    price_label text,
    CONSTRAINT plans_catalog_display_metadata_check CHECK (((catalog_status <> 'catalog'::text) OR ((description IS NOT NULL) AND ((length(description) >= 1) AND (length(description) <= 240)) AND (target_audience IS NOT NULL) AND ((length(target_audience) >= 1) AND (length(target_audience) <= 160)) AND (highlighted_features IS NOT NULL) AND ((cardinality(highlighted_features) >= 1) AND (cardinality(highlighted_features) <= 6)) AND (display_order IS NOT NULL) AND (display_order > 0) AND (cta_text IS NOT NULL) AND ((length(cta_text) >= 1) AND (length(cta_text) <= 80)) AND (price_label IS NOT NULL) AND ((length(price_label) >= 1) AND (length(price_label) <= 80))))),
    CONSTRAINT plans_catalog_status_check CHECK ((catalog_status = ANY (ARRAY['development'::text, 'catalog'::text, 'inactive'::text]))),
    CONSTRAINT plans_check CHECK (((catalog_status = 'development'::text) = is_development)),
    CONSTRAINT plans_code_check CHECK (((code = upper(code)) AND (btrim(code) <> ''::text))),
    CONSTRAINT plans_commercial_class_check CHECK ((commercial_class = ANY (ARRAY['non_commercial'::text, 'free'::text, 'paid'::text]))),
    CONSTRAINT plans_development_non_commercial_check CHECK ((((code = 'DEVELOPMENT'::text) AND is_development AND (catalog_status = 'development'::text) AND (commercial_class = 'non_commercial'::text)) OR ((code <> 'DEVELOPMENT'::text) AND (NOT is_development) AND (catalog_status <> 'development'::text) AND (commercial_class <> 'non_commercial'::text)))),
    CONSTRAINT plans_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: COLUMN plans.is_development; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.plans.is_development IS 'True only for DEVELOPMENT, an internal testing plan excluded from the commercial catalog and forbidden in production provisioning.';


--
-- Name: COLUMN plans.commercial_class; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.plans.commercial_class IS 'Explicit future pricing class; independent from catalog_status. Does not implement prices or payment collection.';


--
-- Name: COLUMN plans.price_label; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.plans.price_label IS 'Display-only catalog label; it is deliberately not a price or billing amount.';


--
-- Name: rate_limit_buckets; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.rate_limit_buckets (
    bucket_key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT rate_limit_buckets_request_count_check CHECK ((request_count > 0))
);


--
-- Name: receivables; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.receivables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid NOT NULL,
    enrollment_id uuid,
    sector_id uuid,
    activity_id uuid,
    concept text NOT NULL,
    period_month smallint,
    period_year smallint,
    due_date date,
    amount numeric(14,2) NOT NULL,
    club_amount numeric(14,2) DEFAULT 0 NOT NULL,
    status miclub.receivable_status DEFAULT 'pendiente'::miclub.receivable_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    CONSTRAINT receivables_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT receivables_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: roles; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: salon_hour_prices; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.salon_hour_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hours integer NOT NULL,
    price numeric(14,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL
);


--
-- Name: sector_settlements; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.sector_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector_id uuid NOT NULL,
    responsible_person_id uuid,
    settlement_date date DEFAULT CURRENT_DATE NOT NULL,
    period_month smallint,
    period_year smallint,
    gross_income numeric(14,2) DEFAULT 0 NOT NULL,
    commissions numeric(14,2) DEFAULT 0 NOT NULL,
    expenses numeric(14,2) DEFAULT 0 NOT NULL,
    amount_to_pay numeric(14,2) DEFAULT 0 NOT NULL,
    status miclub.financial_status DEFAULT 'pendiente'::miclub.financial_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sector_settlements_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12)))
);


--
-- Name: sector_templates; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.sector_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    icon_key text NOT NULL,
    is_active boolean DEFAULT true CONSTRAINT sector_templates_active_not_null NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT sector_templates_code_format_ck CHECK ((code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT sector_templates_display_order_ck CHECK ((display_order > 0))
);


--
-- Name: TABLE sector_templates; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.sector_templates IS 'Catálogo global, sin club_id, de identidades disponibles para sectores.';


--
-- Name: sectors; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.sectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    manager_person_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#7DD3FC'::text NOT NULL,
    opening_time time without time zone,
    closing_time time without time zone,
    max_capacity integer,
    municipal_status miclub.entity_status DEFAULT 'pendiente'::miclub.entity_status NOT NULL,
    financial_status miclub.financial_status DEFAULT 'sin_movimientos'::miclub.financial_status NOT NULL,
    operational_status miclub.entity_status DEFAULT 'activa'::miclub.entity_status NOT NULL,
    uses_enrollments boolean DEFAULT false NOT NULL,
    uses_activities boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    club_id uuid NOT NULL,
    description text,
    icon text,
    status text,
    capacity_mode text,
    configured_capacity integer,
    is_system boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    template_id uuid,
    icon_key text DEFAULT 'other'::text NOT NULL,
    CONSTRAINT sectors_capacity_mode_allowed_check CHECK (((capacity_mode IS NULL) OR (capacity_mode = ANY (ARRAY['ENROLLMENTS'::text, 'INCOME'::text])))),
    CONSTRAINT sectors_enrollment_capacity_check CHECK (((capacity_mode IS DISTINCT FROM 'ENROLLMENTS'::text) OR (configured_capacity > 0))),
    CONSTRAINT sectors_income_capacity_check CHECK (((capacity_mode IS DISTINCT FROM 'INCOME'::text) OR (configured_capacity IS NULL))),
    CONSTRAINT sectors_status_allowed_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['active'::text, 'inactive'::text, 'under_repair'::text, 'archived'::text]))))
);


--
-- Name: COLUMN sectors.club_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.club_id IS 'Nullable tenant owner introduced for multitenant phase 1; not enforced until backfill is complete.';


--
-- Name: COLUMN sectors.description; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.description IS 'Descripción funcional del sector. Agregada manualmente sin backfill obligatorio.';


--
-- Name: COLUMN sectors.icon; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.icon IS 'Nombre o clave del icono de UI asociado al sector.';


--
-- Name: COLUMN sectors.status; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.status IS 'Estado general del sector. Check agregado como NOT VALID hasta completar diagnóstico/backfill.';


--
-- Name: COLUMN sectors.capacity_mode; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.capacity_mode IS 'ENROLLMENTS: cupo por inscriptos; INCOME: capacidad según récord mensual de ingresos.';


--
-- Name: COLUMN sectors.configured_capacity; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.configured_capacity IS 'Límite entero positivo exclusivamente para capacity_mode=ENROLLMENTS.';


--
-- Name: COLUMN sectors.is_system; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.is_system IS 'Indica sectores base/sistémicos que no deberían tratarse como registros de usuario.';


--
-- Name: COLUMN sectors.archived_at; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.archived_at IS 'Fecha/hora de archivado lógico; NULL indica sector no archivado.';


--
-- Name: COLUMN sectors.created_by; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.created_by IS 'Persona/usuario que creó el sector, nullable hasta completar trazabilidad.';


--
-- Name: COLUMN sectors.updated_by; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.sectors.updated_by IS 'Persona/usuario que actualizó el sector, nullable hasta completar trazabilidad.';


--
-- Name: sheet_metric_snapshots; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.sheet_metric_snapshots (
    metric_key text NOT NULL,
    metric_value numeric(14,2),
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'google_sheets'::text NOT NULL,
    source_range text,
    source_payload jsonb,
    club_id uuid NOT NULL
);


--
-- Name: system_months; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.system_months (
    month_number smallint NOT NULL,
    name text NOT NULL,
    CONSTRAINT system_months_month_number_check CHECK (((month_number >= 1) AND (month_number <= 12)))
);


--
-- Name: tasks; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    priority text DEFAULT 'NORMAL'::text NOT NULL,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by_user_id uuid,
    created_by_membership_id uuid,
    assigned_to_user_id uuid,
    assigned_to_membership_id uuid,
    related_entity_type text,
    related_entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT tasks_completed_status_check CHECK (((completed_at IS NULL) OR (status = 'COMPLETED'::text))),
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['LOW'::text, 'NORMAL'::text, 'HIGH'::text, 'URGENT'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text]))),
    CONSTRAINT tasks_title_not_blank_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE tasks; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.tasks IS 'Tareas operativas por club; no ejecuta payloads JSON arbitrarios.';


--
-- Name: COLUMN tasks.metadata; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.tasks.metadata IS 'Metadatos descriptivos sanitizados; no debe contener credenciales ni instrucciones ejecutables.';


--
-- Name: tenant_sequences; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.tenant_sequences (
    club_id uuid NOT NULL,
    entity_type text NOT NULL,
    last_value bigint NOT NULL,
    CONSTRAINT tenant_sequences_entity_type_check CHECK ((entity_type = ANY (ARRAY['movement'::text, 'enrollment'::text]))),
    CONSTRAINT tenant_sequences_last_value_check CHECK ((last_value > 0))
);


--
-- Name: user_club_memberships; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.user_club_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    club_id uuid NOT NULL,
    role_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    sector_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_club_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

ALTER TABLE ONLY miclub.user_club_memberships FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE user_club_memberships; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.user_club_memberships IS 'Autorización de una cuenta dentro de un club; fuente del TenantContext firmado en la sesión.';


--
-- Name: users; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.users (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT app_users_id_not_null NOT NULL,
    role_id uuid,
    email public.citext CONSTRAINT app_users_email_not_null NOT NULL,
    password_hash text CONSTRAINT app_users_password_hash_not_null NOT NULL,
    display_name text CONSTRAINT app_users_display_name_not_null NOT NULL,
    is_active boolean DEFAULT true CONSTRAINT app_users_is_active_not_null NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT app_users_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT app_users_updated_at_not_null NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    session_revoked_before timestamp with time zone,
    CONSTRAINT users_failed_login_attempts_check CHECK ((failed_login_attempts >= 0)),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.users IS 'Cuentas de acceso a miClub; reemplaza a miclub.app_users.';


--
-- Name: COLUMN users.status; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.users.status IS 'Estado de autenticación: active o disabled.';


--
-- Name: COLUMN users.failed_login_attempts; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.users.failed_login_attempts IS 'Intentos fallidos consecutivos desde el último login exitoso.';


--
-- Name: COLUMN users.locked_until; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.users.locked_until IS 'Impide nuevos intentos de login hasta este instante.';


--
-- Name: COLUMN users.session_revoked_before; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.users.session_revoked_before IS 'Revoca cookies firmadas emitidas en o antes de este instante; logout global y cambios de seguridad.';


--
-- Name: v_activity_settlement_balances; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_activity_settlement_balances AS
 SELECT settlement.id AS settlement_id,
    settlement.club_id,
    settlement.activity_id,
    activity.sector_id,
    settlement.activity_term_id,
    settlement.period_from,
    settlement.period_to,
    term.mode,
    income.completed_income,
        CASE term.mode
            WHEN 'VARIABLE'::text THEN round(((income.completed_income * ((100)::numeric - term.club_share_percentage)) / (100)::numeric), 2)
            WHEN 'FIXED'::text THEN round((income.completed_income - (term.monthly_fixed_fee * (((EXTRACT(year FROM age((settlement.period_to)::timestamp with time zone, (settlement.period_from)::timestamp with time zone)) * (12)::numeric) + EXTRACT(month FROM age((settlement.period_to)::timestamp with time zone, (settlement.period_from)::timestamp with time zone))) + (1)::numeric))), 2)
            ELSE NULL::numeric
        END AS responsible_gross,
    allocation.completed_allocations,
        CASE term.mode
            WHEN 'VARIABLE'::text THEN round((((income.completed_income * ((100)::numeric - term.club_share_percentage)) / (100)::numeric) - allocation.completed_allocations), 2)
            WHEN 'FIXED'::text THEN round(((income.completed_income - (term.monthly_fixed_fee * (((EXTRACT(year FROM age((settlement.period_to)::timestamp with time zone, (settlement.period_from)::timestamp with time zone)) * (12)::numeric) + EXTRACT(month FROM age((settlement.period_to)::timestamp with time zone, (settlement.period_from)::timestamp with time zone))) + (1)::numeric))) - allocation.completed_allocations), 2)
            ELSE NULL::numeric
        END AS settlement_balance
   FROM ((((miclub.activity_settlements settlement
     JOIN miclub.activity_terms term ON (((term.id = settlement.activity_term_id) AND (term.activity_id = settlement.activity_id) AND (term.club_id = settlement.club_id))))
     JOIN miclub.activities activity ON (((activity.id = settlement.activity_id) AND (activity.club_id = settlement.club_id))))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(abs(movement.amount)), (0)::numeric) AS completed_income
           FROM miclub.movements movement
          WHERE ((movement.club_id = settlement.club_id) AND (movement.activity_id = settlement.activity_id) AND (movement.movement_type = 'INGRESOS'::miclub.movement_type) AND ((movement.operational_status)::text = ANY (ARRAY['COMPLETADO'::text, 'COMPLETED'::text])) AND (movement.voided_at IS NULL) AND ((((movement.movement_date AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date >= settlement.period_from) AND (((movement.movement_date AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date <= settlement.period_to)))) income ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(allocation_1.amount), (0)::numeric) AS completed_allocations
           FROM (miclub.activity_settlement_allocations allocation_1
             LEFT JOIN miclub.movements movement ON (((movement.id = allocation_1.movement_id) AND (movement.club_id = allocation_1.club_id))))
          WHERE ((allocation_1.settlement_id = settlement.id) AND (allocation_1.club_id = settlement.club_id) AND (allocation_1.status = 'COMPLETADO'::text) AND (allocation_1.voided_at IS NULL) AND ((((allocation_1.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date >= settlement.period_from) AND (((allocation_1.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date <= settlement.period_to)) AND ((allocation_1.movement_id IS NULL) OR ((movement.activity_id = settlement.activity_id) AND ((movement.operational_status)::text = ANY (ARRAY['COMPLETADO'::text, 'COMPLETED'::text])) AND (movement.voided_at IS NULL))))) allocation ON (true))
  WHERE ((settlement.status = 'COMPLETADO'::text) AND (settlement.voided_at IS NULL) AND ((settlement.period_from >= term.effective_from) AND (settlement.period_from <= COALESCE(term.effective_to, 'infinity'::date))) AND ((settlement.period_to >= term.effective_from) AND (settlement.period_to <= COALESCE(term.effective_to, 'infinity'::date))) AND ((term.mode <> 'FIXED'::text) OR ((EXTRACT(day FROM settlement.period_from) = (1)::numeric) AND (settlement.period_to = ((date_trunc('month'::text, (settlement.period_to)::timestamp with time zone) + '1 mon -1 days'::interval))::date))));


--
-- Name: VIEW v_activity_settlement_balances; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON VIEW miclub.v_activity_settlement_balances IS 'Liquidaciones canónicas por actividad, período y término histórico; sólo completadas, no anuladas y con pagos explícitamente asignados.';


--
-- Name: v_activity_settlement_sector_balances; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_activity_settlement_sector_balances AS
 SELECT sector.id AS sector_id,
    sector.code AS sector_code,
    sector.name AS sector_name,
    sector.club_id,
    COALESCE(sum(balance.settlement_balance), (0)::numeric) AS settlement_balance
   FROM (miclub.sectors sector
     LEFT JOIN miclub.v_activity_settlement_balances balance ON (((balance.sector_id = sector.id) AND (balance.club_id = sector.club_id))))
  GROUP BY sector.club_id, sector.id, sector.code, sector.name;


--
-- Name: VIEW v_activity_settlement_sector_balances; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON VIEW miclub.v_activity_settlement_sector_balances IS 'Saldos canónicos agregados exclusivamente por sector_id y club_id.';


--
-- Name: v_movements_enriched; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_movements_enriched AS
 SELECT m.id,
    m.external_id,
    m.movement_date,
    m.movement_type,
    c.name AS category,
    s.code AS sector_code,
    s.name AS sector_name,
    m.concept,
    p.first_name,
    p.last_name,
    p.dni,
    m.counterparty_text,
    m.amount,
    m.taxes,
    pm.name AS payment_method,
    m.financial_status,
    m.operational_status,
    m.source,
    m.created_at,
    m.category_id,
    m.sector_id,
    m.counterparty_person_id AS person_id,
    m.payment_method_id,
    m.source_payload,
    m.updated_at,
    m.club_id
   FROM ((((miclub.movements m
     LEFT JOIN miclub.movement_categories c ON (((c.id = m.category_id) AND (c.club_id = m.club_id))))
     LEFT JOIN miclub.sectors s ON (((s.id = m.sector_id) AND (s.club_id = m.club_id))))
     LEFT JOIN miclub.people p ON (((p.id = m.counterparty_person_id) AND (p.club_id = m.club_id))))
     LEFT JOIN miclub.payment_methods pm ON (((pm.id = m.payment_method_id) AND (pm.club_id = m.club_id))));


--
-- Name: v_admin_completed_movements; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_admin_completed_movements AS
 SELECT id,
    external_id,
    movement_date,
    movement_type,
    category,
    sector_code,
    sector_name,
    concept,
    first_name,
    last_name,
    dni,
    counterparty_text,
    amount,
    taxes,
    payment_method,
    financial_status,
    operational_status,
    source,
    created_at,
    category_id,
    sector_id,
    person_id,
    payment_method_id,
    source_payload,
    updated_at
   FROM miclub.v_movements_enriched
  WHERE ((replace(upper(COALESCE(sector_name, ''::text)), 'Ó'::text, 'O'::text) = 'ADMINISTRACION'::text) AND (operational_status = 'COMPLETADO'::miclub.movement_status));


--
-- Name: v_admin_pending_movements; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_admin_pending_movements AS
 SELECT id,
    external_id,
    movement_date,
    movement_type,
    category,
    sector_code,
    sector_name,
    concept,
    first_name,
    last_name,
    dni,
    counterparty_text,
    amount,
    taxes,
    payment_method,
    financial_status,
    operational_status,
    source,
    created_at,
    category_id,
    sector_id,
    person_id,
    payment_method_id,
    source_payload,
    updated_at
   FROM miclub.v_movements_enriched
  WHERE ((COALESCE((source_payload ->> 'sheet'::text), ''::text) = 'ADMINISTRACIÓN'::text) AND ((operational_status = 'PENDIENTE'::miclub.movement_status) OR (financial_status = 'pendiente'::miclub.financial_status)));


--
-- Name: v_sector_settlement_balances; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_sector_settlement_balances AS
 SELECT sector_id,
    sector_code,
    sector_name,
    settlement_balance,
    club_id
   FROM miclub.v_activity_settlement_sector_balances;


--
-- Name: VIEW v_sector_settlement_balances; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON VIEW miclub.v_sector_settlement_balances IS 'Saldos a liquidar por sector, aislados por club_id.';


--
-- Name: v_admin_real_balances; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_admin_real_balances AS
 WITH latest_balance AS (
         SELECT operational_balances.source_payload,
                CASE
                    WHEN ((operational_balances.source_payload ->> 'fx'::text) ~ '^-?[0-9]+([\.,][0-9]+)?$'::text) THEN (replace((operational_balances.source_payload ->> 'fx'::text), ','::text, '.'::text))::numeric
                    WHEN ((((operational_balances.source_payload -> 'rows'::text) -> 2) ->> 2) ~ '^-?[0-9]+([\.,][0-9]+)?$'::text) THEN (replace((((operational_balances.source_payload -> 'rows'::text) -> 2) ->> 2), ','::text, '.'::text))::numeric
                    ELSE (0)::numeric
                END AS fx
           FROM miclub.operational_balances
          ORDER BY operational_balances.cutoff_date DESC, operational_balances.created_at DESC
         LIMIT 1
        ), admin_totals AS (
         SELECT COALESCE(sum(
                CASE
                    WHEN ((v_admin_completed_movements.movement_type = ANY (ARRAY['INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type])) AND (lower(COALESCE(v_admin_completed_movements.payment_method, ''::text)) = 'efectivo'::text)) THEN v_admin_completed_movements.amount
                    WHEN ((v_admin_completed_movements.movement_type = 'EGRESOS'::miclub.movement_type) AND (lower(COALESCE(v_admin_completed_movements.payment_method, ''::text)) = 'efectivo'::text)) THEN (- v_admin_completed_movements.amount)
                    ELSE (0)::numeric
                END), (0)::numeric) AS cash,
            COALESCE(sum(
                CASE
                    WHEN ((v_admin_completed_movements.movement_type = ANY (ARRAY['INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type])) AND (lower(COALESCE(v_admin_completed_movements.payment_method, ''::text)) = 'transferencia'::text)) THEN v_admin_completed_movements.amount
                    WHEN ((v_admin_completed_movements.movement_type = 'EGRESOS'::miclub.movement_type) AND (lower(COALESCE(v_admin_completed_movements.payment_method, ''::text)) = 'transferencia'::text)) THEN (- v_admin_completed_movements.amount)
                    ELSE (0)::numeric
                END), (0)::numeric) AS bank,
            COALESCE(sum(
                CASE
                    WHEN ((v_admin_completed_movements.movement_type = ANY (ARRAY['INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type])) AND (replace(upper(COALESCE(v_admin_completed_movements.category, ''::text)), 'Ó'::text, 'O'::text) = 'DOLARES'::text)) THEN v_admin_completed_movements.amount
                    WHEN ((v_admin_completed_movements.movement_type = 'EGRESOS'::miclub.movement_type) AND (replace(upper(COALESCE(v_admin_completed_movements.category, ''::text)), 'Ó'::text, 'O'::text) = 'DOLARES'::text)) THEN (- v_admin_completed_movements.amount)
                    ELSE (0)::numeric
                END), (0)::numeric) AS dollars,
            COALESCE(sum(
                CASE
                    WHEN (v_admin_completed_movements.movement_type = 'CAPITAL'::miclub.movement_type) THEN v_admin_completed_movements.amount
                    ELSE (0)::numeric
                END), (0)::numeric) AS capital,
            COALESCE(sum(
                CASE
                    WHEN ((v_admin_completed_movements.movement_type = 'CAPITAL'::miclub.movement_type) AND (replace(upper(COALESCE(v_admin_completed_movements.category, ''::text)), 'Ó'::text, 'O'::text) = 'DOLARES'::text)) THEN v_admin_completed_movements.amount
                    ELSE (0)::numeric
                END), (0)::numeric) AS capital_dollars
           FROM miclub.v_admin_completed_movements
        ), settlements AS (
         SELECT COALESCE(sum(GREATEST(v_sector_settlement_balances.settlement_balance, (0)::numeric)), (0)::numeric) AS sector_settlement_balance
           FROM miclub.v_sector_settlement_balances
        )
 SELECT (((a.capital - a.capital_dollars) + s.sector_settlement_balance) + (a.dollars * COALESCE(lb.fx, (0)::numeric))) AS liquidity,
    a.cash,
    a.bank,
    a.dollars
   FROM ((admin_totals a
     CROSS JOIN settlements s)
     LEFT JOIN latest_balance lb ON (true));


--
-- Name: v_cantina_special_metrics; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_cantina_special_metrics AS
 SELECT COALESCE(sum(
        CASE
            WHEN ((movement_type = 'INGRESOS'::miclub.movement_type) AND (upper(COALESCE(category, ''::text)) = 'KIOSCO'::text)) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS kiosk_income,
    COALESCE(sum(
        CASE
            WHEN ((movement_type = 'INGRESOS'::miclub.movement_type) AND (upper(COALESCE(category, ''::text)) = 'BEBIDAS'::text)) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS drinks_income,
    COALESCE(sum(
        CASE
            WHEN ((movement_type = 'EGRESOS'::miclub.movement_type) AND (upper(COALESCE(category, ''::text)) = 'BEBIDAS'::text)) THEN amount
            ELSE (0)::numeric
        END), (0)::numeric) AS cmv,
    COALESCE(sum(
        CASE
            WHEN ((movement_type = 'INGRESOS'::miclub.movement_type) AND (upper(COALESCE(category, ''::text)) = ANY (ARRAY['KIOSCO'::text, 'BEBIDAS'::text]))) THEN amount
            WHEN ((movement_type = 'EGRESOS'::miclub.movement_type) AND (upper(COALESCE(category, ''::text)) = 'BEBIDAS'::text)) THEN (- amount)
            ELSE (0)::numeric
        END), (0)::numeric) AS total_profitability
   FROM miclub.v_movements_enriched
  WHERE (upper(COALESCE(sector_name, ''::text)) = 'CANTINA'::text);


--
-- Name: v_enrollment_payment_candidates; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_enrollment_payment_candidates AS
 WITH cuota_categories AS (
         SELECT movement_categories.id
           FROM miclub.movement_categories
          WHERE (lower(movement_categories.name) ~~ '%cuota%'::text)
        ), payment_candidates AS (
         SELECT e.id AS enrollment_id,
            m.movement_date,
            m.created_at,
            m.amount,
            m.concept,
            ms.name AS source_sheet
           FROM (((((miclub.enrollments e
             JOIN miclub.people p ON ((p.id = e.person_id)))
             JOIN miclub.activities a ON ((a.id = e.activity_id)))
             JOIN miclub.sectors s ON ((s.id = a.sector_id)))
             JOIN miclub.movements m ON (((m.movement_type = 'INGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND ((m.person_id = p.id) OR (m.counterparty_person_id = p.id) OR ((p.dni IS NOT NULL) AND (regexp_replace(COALESCE(m.counterparty_text, ''::text), '[^0-9]'::text, ''::text, 'g'::text) = regexp_replace(p.dni, '[^0-9]'::text, ''::text, 'g'::text))) OR (m.concept ~~* (('%'::text || (e.id)::text) || '%'::text)) OR (m.concept ~~* (('%'::text || e.external_id) || '%'::text))) AND ((m.category_id IN ( SELECT cuota_categories.id
                   FROM cuota_categories)) OR (m.concept ~~* '%cuota%'::text) OR (m.concept ~~* (('%['::text || split_part(e.external_id, ':'::text, 3)) || ']%'::text)) OR (m.sector_id = s.id) OR (m.concept ~~* (('%'::text || a.name) || '%'::text))))))
             LEFT JOIN miclub.sectors ms ON ((ms.id = m.sector_id)))
        )
 SELECT enrollment_id,
    max(movement_date) AS last_payment_at,
    (array_agg(amount ORDER BY movement_date DESC, created_at DESC))[1] AS last_payment_amount,
    (array_agg(concept ORDER BY movement_date DESC, created_at DESC))[1] AS last_payment_concept,
    (array_agg(source_sheet ORDER BY movement_date DESC, created_at DESC))[1] AS last_payment_source_sheet
   FROM payment_candidates
  GROUP BY enrollment_id;


--
-- Name: v_enrollment_operational_status; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_enrollment_operational_status AS
 SELECT e.id AS enrollment_id,
    e.external_id,
    e.person_id,
    e.activity_id,
    e.fee_amount,
    e.status AS stored_status,
    (e.created_at)::date AS enrollment_date,
    COALESCE(ep.last_payment_at, e.last_payment_at) AS last_payment_at,
    COALESCE(((COALESCE(ep.last_payment_at, e.last_payment_at))::date + 31), e.due_date, ((e.created_at)::date + 31)) AS due_date,
        CASE
            WHEN (e.status = ANY (ARRAY['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) THEN e.status
            WHEN ((COALESCE(ep.last_payment_at, e.last_payment_at) IS NOT NULL) AND ((CURRENT_DATE - (COALESCE(ep.last_payment_at, e.last_payment_at))::date) <= 30)) THEN 'al_dia'::miclub.enrollment_status
            WHEN ((COALESCE(ep.last_payment_at, e.last_payment_at) IS NOT NULL) AND (((CURRENT_DATE - (COALESCE(ep.last_payment_at, e.last_payment_at))::date) >= 31) AND ((CURRENT_DATE - (COALESCE(ep.last_payment_at, e.last_payment_at))::date) <= 60))) THEN 'adeudando'::miclub.enrollment_status
            WHEN ((COALESCE(ep.last_payment_at, e.last_payment_at) IS NOT NULL) AND ((CURRENT_DATE - (COALESCE(ep.last_payment_at, e.last_payment_at))::date) >= 61)) THEN 'abandonado'::miclub.enrollment_status
            WHEN ((COALESCE(ep.last_payment_at, e.last_payment_at) IS NULL) AND ((CURRENT_DATE - (e.created_at)::date) <= 7)) THEN 'nuevo_inscripto'::miclub.enrollment_status
            WHEN ((COALESCE(ep.last_payment_at, e.last_payment_at) IS NULL) AND (((CURRENT_DATE - (e.created_at)::date) >= 8) AND ((CURRENT_DATE - (e.created_at)::date) <= 60))) THEN 'adeudando'::miclub.enrollment_status
            ELSE 'abandonado'::miclub.enrollment_status
        END AS effective_status,
    ep.last_payment_amount,
    ep.last_payment_source_sheet,
    ep.last_payment_concept
   FROM (miclub.enrollments e
     LEFT JOIN miclub.v_enrollment_payment_candidates ep ON ((ep.enrollment_id = e.id)));


--
-- Name: v_current_enrollments; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_current_enrollments AS
 SELECT e.id,
    e.external_id,
    p.first_name,
    p.last_name,
    p.dni,
    p.phone,
    s.code AS sector_code,
    s.name AS sector_name,
    a.name AS activity_name,
    a.modality,
    i.display_name AS instructor_name,
    e.fee_amount,
    eos.effective_status AS status,
    eos.due_date,
    eos.last_payment_at,
    e.id AS enrollment_id,
    p.id AS person_id,
    p.first_name AS nombre,
    p.last_name AS apellido,
    p.phone AS telefono,
    a.name AS actividad,
    a.modality AS modalidad,
    e.fee_amount AS cuota,
    (eos.effective_status)::text AS estado,
    i.display_name AS instructor,
    eos.due_date AS vence,
    s.name AS source_sheet,
    eos.last_payment_amount,
    eos.last_payment_source_sheet,
    eos.last_payment_concept
   FROM (((((miclub.enrollments e
     JOIN miclub.v_enrollment_operational_status eos ON ((eos.enrollment_id = e.id)))
     JOIN miclub.people p ON ((p.id = e.person_id)))
     JOIN miclub.activities a ON ((a.id = e.activity_id)))
     JOIN miclub.sectors s ON ((s.id = a.sector_id)))
     LEFT JOIN miclub.instructors i ON ((i.id = a.instructor_id)))
  WHERE (eos.effective_status <> 'cancelado'::miclub.enrollment_status);


--
-- Name: v_sector_finance_summary; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_sector_finance_summary AS
 SELECT s.id AS sector_id,
    s.code AS sector_code,
    s.name AS sector_name,
    COALESCE(sum(m.amount) FILTER (WHERE ((m.movement_type = 'INGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status))), (0)::numeric) AS total_income,
    COALESCE(sum(m.amount) FILTER (WHERE ((m.movement_type = 'EGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status))), (0)::numeric) AS total_expense,
    COALESCE(sum(
        CASE
            WHEN ((m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.movement_type = 'INGRESOS'::miclub.movement_type)) THEN m.amount
            WHEN ((m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- m.amount)
            ELSE (0)::numeric
        END), (0)::numeric) AS balance,
        CASE
            WHEN (upper(replace(s.name, ' '::text, '_'::text)) = ANY (ARRAY['FITNESS'::text, 'LOCAL_1'::text])) THEN COALESCE(sum(
            CASE
                WHEN ((m.financial_status = 'a_liquidar'::miclub.financial_status) AND (m.movement_type = 'INGRESOS'::miclub.movement_type)) THEN m.amount
                WHEN ((m.financial_status = 'a_liquidar'::miclub.financial_status) AND (m.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- m.amount)
                ELSE (0)::numeric
            END), (0)::numeric)
            ELSE NULL::numeric
        END AS settlement_balance,
    COALESCE(sum(
        CASE
            WHEN ((m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.financial_status <> 'a_liquidar'::miclub.financial_status) AND (m.movement_type = 'INGRESOS'::miclub.movement_type)) THEN m.amount
            WHEN ((m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.financial_status <> 'a_liquidar'::miclub.financial_status) AND (m.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- m.amount)
            ELSE (0)::numeric
        END), (0)::numeric) AS total_profitability,
    COALESCE(sum(
        CASE
            WHEN ((date_trunc('month'::text, m.movement_date) = date_trunc('month'::text, now())) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.movement_type = 'INGRESOS'::miclub.movement_type)) THEN m.amount
            WHEN ((date_trunc('month'::text, m.movement_date) = date_trunc('month'::text, now())) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- m.amount)
            ELSE (0)::numeric
        END), (0)::numeric) AS current_month_profitability,
    s.club_id
   FROM (miclub.sectors s
     LEFT JOIN miclub.movements m ON (((m.sector_id = s.id) AND (m.club_id = s.club_id))))
  GROUP BY s.club_id, s.id, s.code, s.name;


--
-- Name: v_dashboard_basic; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_dashboard_basic AS
 SELECT c.id AS club_id,
    COALESCE(m.total_income, (0)::numeric) AS total_income,
    COALESCE(m.total_expense, (0)::numeric) AS total_expense,
    (COALESCE(m.total_income, (0)::numeric) - COALESCE(m.total_expense, (0)::numeric)) AS balance,
    COALESCE(m.liquidity, (0)::numeric) AS liquidity,
    COALESCE(m.liquidity, (0)::numeric) AS cash,
    (0)::numeric AS bank,
    (0)::numeric AS dollars,
    COALESCE(m.profitability, (0)::numeric) AS profitability,
    COALESCE(m.pending_income, (0)::numeric) AS pending_income,
    COALESCE(m.pending_expenses, (0)::numeric) AS pending_expenses,
    (COALESCE(m.pending_income, (0)::numeric) - COALESCE(m.pending_expenses, (0)::numeric)) AS pending_net_balance,
    COALESCE(e.active_enrollments, (0)::bigint) AS active_enrollments,
    COALESCE(e.debtor_enrollments, (0)::bigint) AS debtor_enrollments,
    COALESCE(r.receivables_total, (0)::numeric) AS receivables_total,
    COALESCE(s.saldos_a_pagar, (0)::numeric) AS saldos_a_pagar,
    COALESCE(e.cuotas_adeudadas, (0)::numeric) AS cuotas_a_cobrar,
    COALESCE(e.cuotas_adeudadas, (0)::numeric) AS cuotas_adeudadas,
    ((((COALESCE(m.liquidity, (0)::numeric) + COALESCE(r.receivables_total, (0)::numeric)) - COALESCE(s.saldos_a_pagar, (0)::numeric)) + COALESCE(m.pending_income, (0)::numeric)) - COALESCE(m.pending_expenses, (0)::numeric)) AS projected_balance,
    (0)::numeric AS future_receivable_fees_until_month_end,
    now() AS updated_at
   FROM ((((miclub.clubs c
     LEFT JOIN LATERAL ( SELECT sum(movements.amount) FILTER (WHERE ((movements.movement_type = 'INGRESOS'::miclub.movement_type) AND (movements.operational_status = 'COMPLETADO'::miclub.movement_status))) AS total_income,
            sum(movements.amount) FILTER (WHERE ((movements.movement_type = 'EGRESOS'::miclub.movement_type) AND (movements.operational_status = 'COMPLETADO'::miclub.movement_status))) AS total_expense,
            sum(
                CASE
                    WHEN ((movements.operational_status = 'COMPLETADO'::miclub.movement_status) AND (movements.movement_type = 'INGRESOS'::miclub.movement_type)) THEN movements.amount
                    WHEN ((movements.operational_status = 'COMPLETADO'::miclub.movement_status) AND (movements.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- movements.amount)
                    ELSE (0)::numeric
                END) AS liquidity,
            sum(
                CASE
                    WHEN ((movements.operational_status = 'COMPLETADO'::miclub.movement_status) AND (movements.financial_status <> 'a_liquidar'::miclub.financial_status) AND (movements.movement_type = 'INGRESOS'::miclub.movement_type)) THEN movements.amount
                    WHEN ((movements.operational_status = 'COMPLETADO'::miclub.movement_status) AND (movements.financial_status <> 'a_liquidar'::miclub.financial_status) AND (movements.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- movements.amount)
                    ELSE (0)::numeric
                END) AS profitability,
            sum(movements.amount) FILTER (WHERE ((movements.movement_type = 'INGRESOS'::miclub.movement_type) AND (movements.operational_status = 'PENDIENTE'::miclub.movement_status) AND ((movements.source_payload ->> 'sheet'::text) = 'ADMINISTRACIÓN'::text))) AS pending_income,
            sum(movements.amount) FILTER (WHERE ((movements.movement_type = 'EGRESOS'::miclub.movement_type) AND (movements.operational_status = 'PENDIENTE'::miclub.movement_status) AND ((movements.source_payload ->> 'sheet'::text) = 'ADMINISTRACIÓN'::text))) AS pending_expenses
           FROM miclub.movements
          WHERE (movements.club_id = c.id)) m ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE (enrollments.status <> ALL (ARRAY['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status]))) AS active_enrollments,
            count(*) FILTER (WHERE (enrollments.status = 'adeudando'::miclub.enrollment_status)) AS debtor_enrollments,
            sum(enrollments.fee_amount) FILTER (WHERE (enrollments.status = 'adeudando'::miclub.enrollment_status)) AS cuotas_adeudadas
           FROM miclub.enrollments
          WHERE (enrollments.club_id = c.id)) e ON (true))
     LEFT JOIN LATERAL ( SELECT sum(receivables.amount) FILTER (WHERE (receivables.status = ANY (ARRAY['pendiente'::miclub.receivable_status, 'parcial'::miclub.receivable_status, 'vencido'::miclub.receivable_status]))) AS receivables_total
           FROM miclub.receivables
          WHERE (receivables.club_id = c.id)) r ON (true))
     LEFT JOIN LATERAL ( SELECT sum(GREATEST(v_sector_finance_summary.settlement_balance, (0)::numeric)) AS saldos_a_pagar
           FROM miclub.v_sector_finance_summary
          WHERE (v_sector_finance_summary.club_id = c.id)) s ON (true));


--
-- Name: v_enrollment_lifecycle_v2; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_enrollment_lifecycle_v2 AS
 WITH payment_candidates AS (
         SELECT e.id AS enrollment_id,
            (max(m.movement_date))::date AS payment_last_payment_at
           FROM ((miclub.enrollments e
             JOIN miclub.activities payment_activity ON (((payment_activity.id = e.activity_id) AND (payment_activity.club_id = e.club_id))))
             JOIN miclub.movements m ON (((m.club_id = e.club_id) AND (m.person_id = e.person_id) AND (m.movement_type = 'INGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.voided_at IS NULL) AND ((m.activity_id = e.activity_id) OR ((m.activity_id IS NULL) AND ((m.sector_id = payment_activity.sector_id) OR (1 = ( SELECT count(*) AS count
                   FROM miclub.enrollments sibling
                  WHERE ((sibling.club_id = e.club_id) AND (sibling.person_id = e.person_id) AND (sibling.status <> 'cancelado'::miclub.enrollment_status))))))))))
          GROUP BY e.id
        ), facts AS (
         SELECT e.id,
            e.club_id,
            e.status,
            e.status_override,
            COALESCE(e.enrollment_date, (e.created_at)::date) AS enrollment_date,
            p.payment_last_payment_at,
            COALESCE(p.payment_last_payment_at, e.enrollment_date, (e.created_at)::date) AS anchor_date
           FROM (miclub.enrollments e
             LEFT JOIN payment_candidates p ON ((p.enrollment_id = e.id)))
        )
 SELECT id AS enrollment_id,
    club_id,
    status AS stored_status,
        CASE
            WHEN (status_override OR (status = 'cancelado'::miclub.enrollment_status)) THEN status
            WHEN (CURRENT_DATE <= (enrollment_date + 10)) THEN 'nuevo_inscripto'::miclub.enrollment_status
            WHEN ((payment_last_payment_at IS NOT NULL) AND (CURRENT_DATE <= (payment_last_payment_at + 30))) THEN 'al_dia'::miclub.enrollment_status
            WHEN (CURRENT_DATE >= (anchor_date + 62)) THEN 'abandonado'::miclub.enrollment_status
            ELSE 'adeudando'::miclub.enrollment_status
        END AS effective_status,
    payment_last_payment_at AS last_payment_at,
    (anchor_date + 30) AS due_date,
    (GREATEST((0)::numeric, floor(((GREATEST(0, ((CURRENT_DATE - anchor_date) - 1)))::numeric / (30)::numeric))))::integer AS overdue_installments,
    status_override
   FROM facts f;


--
-- Name: VIEW v_enrollment_lifecycle_v2; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON VIEW miclub.v_enrollment_lifecycle_v2 IS 'Operational truth: new through day 10; paid through day 30; abandoned at day 62; overdue installment count never accumulates money.';


--
-- Name: v_enrollment_receivable_fees; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_enrollment_receivable_fees AS
 SELECT e.id AS enrollment_id,
    life.effective_status AS status,
    life.due_date,
    e.fee_amount,
    COALESCE(e.normalized_fee_amount, miclub.normalize_enrollment_fee_amount(e.fee_amount)) AS normalized_fee_amount,
    s.name AS sector_name,
    a.name AS activity_name,
    commission.rate AS commission_rate,
        CASE
            WHEN (life.effective_status = ANY (ARRAY['abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status])) THEN (0)::numeric
            ELSE (COALESCE(e.normalized_fee_amount, miclub.normalize_enrollment_fee_amount(e.fee_amount)) * commission.rate)
        END AS receivable_fee
   FROM ((((miclub.enrollments e
     JOIN miclub.v_enrollment_lifecycle_v2 life ON (((life.enrollment_id = e.id) AND (life.club_id = e.club_id))))
     JOIN miclub.activities a ON (((a.id = e.activity_id) AND (a.club_id = e.club_id))))
     JOIN miclub.sectors s ON (((s.id = a.sector_id) AND (s.club_id = e.club_id))))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (upper(regexp_replace(COALESCE(s.code, s.name, ''::text), '[^[:alnum:]]+'::text, '_'::text, 'g'::text)) = ANY (ARRAY['FITNESS'::text, 'ESPACIO_FITNESS'::text])) THEN 0.5
                    WHEN (upper(regexp_replace(COALESCE(s.code, s.name, ''::text), '[^[:alnum:]]+'::text, '_'::text, 'g'::text)) = 'AULA'::text) THEN GREATEST((0)::numeric, LEAST((1)::numeric,
                    CASE
                        WHEN (COALESCE(a.club_commission_percent, (0)::numeric) > (1)::numeric) THEN (a.club_commission_percent / (100)::numeric)
                        ELSE COALESCE(a.club_commission_percent, (0)::numeric)
                    END))
                    ELSE (0)::numeric
                END AS rate) commission);


--
-- Name: VIEW v_enrollment_receivable_fees; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON VIEW miclub.v_enrollment_receivable_fees IS 'Base de cuotas por inscripcion. Regla de Cuotas a cobrar: sumar receivable_fee solo cuando status/effective_status = adeudando; nuevo_inscripto no integra Cuotas a cobrar.';


--
-- Name: v_financial_account_liquidity; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_financial_account_liquidity AS
 SELECT a.club_id,
    a.id AS account_id,
    a.code,
    a.name,
    a.currency_code,
    (COALESCE(sum(
        CASE
            WHEN (m.movement_type = 'EGRESOS'::miclub.movement_type) THEN (- m.amount)
            WHEN (m.movement_type = ANY (ARRAY['INGRESOS'::miclub.movement_type, 'CAPITAL'::miclub.movement_type])) THEN m.amount
            ELSE (0)::numeric
        END), (0)::numeric))::numeric(14,2) AS balance
   FROM (miclub.financial_accounts a
     LEFT JOIN miclub.movements m ON (((m.club_id = a.club_id) AND (m.account_id = a.id) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.voided_at IS NULL))))
  GROUP BY a.club_id, a.id, a.code, a.name, a.currency_code;


--
-- Name: v_legacy_movement_categories; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_legacy_movement_categories AS
 SELECT club_id,
    id,
    name,
    created_at
   FROM miclub.movement_categories mc
  WHERE (catalog_id IS NULL);


--
-- Name: v_local1_special_metrics; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_local1_special_metrics AS
 WITH relevant AS (
         SELECT v_movements_enriched.id,
            v_movements_enriched.external_id,
            v_movements_enriched.movement_date,
            v_movements_enriched.movement_type,
            v_movements_enriched.category,
            v_movements_enriched.sector_code,
            v_movements_enriched.sector_name,
            v_movements_enriched.concept,
            v_movements_enriched.first_name,
            v_movements_enriched.last_name,
            v_movements_enriched.dni,
            v_movements_enriched.counterparty_text,
            v_movements_enriched.amount,
            v_movements_enriched.taxes,
            v_movements_enriched.payment_method,
            v_movements_enriched.financial_status,
            v_movements_enriched.operational_status,
            v_movements_enriched.source,
            v_movements_enriched.created_at,
            v_movements_enriched.category_id,
            v_movements_enriched.sector_id,
            v_movements_enriched.person_id,
            v_movements_enriched.payment_method_id,
            v_movements_enriched.source_payload,
            v_movements_enriched.updated_at
           FROM miclub.v_movements_enriched
          WHERE ((upper(replace(COALESCE(v_movements_enriched.sector_name, ''::text), ' '::text, '_'::text)) = 'LOCAL_1'::text) AND (v_movements_enriched.movement_type = 'INGRESOS'::miclub.movement_type) AND (upper(COALESCE(v_movements_enriched.category, ''::text)) = ANY (ARRAY['COMISIÓN'::text, 'COMISION'::text, 'VENTAS'::text])))
        ), highlighted AS (
         SELECT relevant.amount,
            COALESCE(NULLIF(relevant.concept, ''::text), relevant.category) AS concept,
            relevant.movement_date
           FROM relevant
          ORDER BY relevant.amount DESC, relevant.movement_date DESC
         LIMIT 1
        )
 SELECT (( SELECT count(*) AS count
           FROM relevant))::integer AS total_relevant_income_movements,
    (( SELECT count(*) AS count
           FROM relevant
          WHERE (relevant.movement_date >= (now() - '30 days'::interval))))::integer AS last30days_relevant_income_movements,
    ( SELECT highlighted.amount
           FROM highlighted) AS highlighted_income_amount,
    ( SELECT highlighted.concept
           FROM highlighted) AS highlighted_income_concept,
    ( SELECT highlighted.movement_date
           FROM highlighted) AS highlighted_income_date;


--
-- Name: v_module_current_month_profitability; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_module_current_month_profitability AS
 SELECT s.id AS sector_id,
    s.code AS sector_code,
    s.name AS sector_name,
    COALESCE(sum(
        CASE
            WHEN ((date_trunc('month'::text, m.movement_date) = date_trunc('month'::text, now())) AND (m.movement_type = 'INGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status)) THEN m.amount
            WHEN ((date_trunc('month'::text, m.movement_date) = date_trunc('month'::text, now())) AND (m.movement_type = 'EGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status)) THEN (- m.amount)
            ELSE (0)::numeric
        END), (0)::numeric) AS current_month_profitability
   FROM (miclub.sectors s
     LEFT JOIN miclub.movements m ON ((m.sector_id = s.id)))
  GROUP BY s.id, s.code, s.name;


--
-- Name: v_module_total_profitability; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_module_total_profitability AS
 SELECT s.id AS sector_id,
    s.code AS sector_code,
    s.name AS sector_name,
    COALESCE(sum(
        CASE
            WHEN ((m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.financial_status <> 'a_liquidar'::miclub.financial_status) AND (m.movement_type = 'INGRESOS'::miclub.movement_type)) THEN m.amount
            WHEN ((m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.financial_status <> 'a_liquidar'::miclub.financial_status) AND (m.movement_type = 'EGRESOS'::miclub.movement_type)) THEN (- m.amount)
            ELSE (0)::numeric
        END), (0)::numeric) AS total_profitability
   FROM (miclub.sectors s
     LEFT JOIN miclub.movements m ON ((m.sector_id = s.id)))
  GROUP BY s.id, s.code, s.name;


--
-- Name: v_opening_balance_reconciliation; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_opening_balance_reconciliation AS
 SELECT b.club_id,
    b.id AS batch_id,
    b.revision,
    b.operation,
    b.status AS batch_status,
    b.idempotency_key,
    b.reconciliation_status,
    obm.movement_id,
    obm.reverses_movement_id,
    m.account_id,
    a.code AS account_code,
    a.currency_code,
    m.movement_type,
    m.amount,
    m.operational_status,
    m.reconciled_at,
    ((m.club_id = b.club_id) AND (a.club_id = b.club_id) AND (m.movement_type = 'CAPITAL'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (m.voided_at IS NULL)) AS is_consistent
   FROM (((miclub.opening_balance_batches b
     JOIN miclub.opening_balance_movements obm ON ((obm.batch_id = b.id)))
     JOIN miclub.movements m ON ((m.id = obm.movement_id)))
     JOIN miclub.financial_accounts a ON ((a.id = m.account_id)));


--
-- Name: v_receivable_fees_effective_status_debug; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_receivable_fees_effective_status_debug AS
 SELECT status AS effective_status,
    (count(1))::integer AS enrollments_count,
    (COALESCE(sum(receivable_fee), (0)::numeric))::numeric(14,2) AS total_receivable_fee,
    (COALESCE(sum(normalized_fee_amount), (0)::numeric))::numeric(14,2) AS total_normalized_fee
   FROM miclub.v_enrollment_receivable_fees
  GROUP BY status
  ORDER BY status;


--
-- Name: VIEW v_receivable_fees_effective_status_debug; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON VIEW miclub.v_receivable_fees_effective_status_debug IS 'Debug previo a Cuotas a cobrar: conteo y monto por estado efectivo. Cuotas a cobrar debe tomar solo effective_status=adeudando; nuevo_inscripto queda excluido.';


--
-- Name: v_sector_monthly_completed_income; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_sector_monthly_completed_income AS
 SELECT m.club_id,
    m.sector_id,
    (date_trunc('month'::text, ((m.movement_date)::timestamp without time zone AT TIME ZONE COALESCE(NULLIF(c.timezone, ''::text), 'America/Argentina/Buenos_Aires'::text))))::date AS month,
        CASE
            WHEN (count(*) FILTER (WHERE ((COALESCE(m.currency_code, c.base_currency_code) <> c.base_currency_code) AND (er.id IS NULL))) > 0) THEN NULL::numeric
            ELSE sum(
            CASE
                WHEN (COALESCE(m.currency_code, c.base_currency_code) = c.base_currency_code) THEN m.amount
                WHEN ((er.base_currency_code = m.currency_code) AND (er.quote_currency_code = c.base_currency_code)) THEN (m.amount * er.rate)
                WHEN ((er.quote_currency_code = m.currency_code) AND (er.base_currency_code = c.base_currency_code)) THEN (m.amount / er.rate)
                ELSE NULL::numeric
            END)
        END AS income,
    (count(*) FILTER (WHERE ((COALESCE(m.currency_code, c.base_currency_code) <> c.base_currency_code) AND (er.id IS NULL))))::integer AS missing_exchange_rate_count
   FROM ((((miclub.movements m
     JOIN miclub.clubs c ON ((c.id = m.club_id)))
     LEFT JOIN miclub.movement_categories mc ON (((mc.id = m.category_id) AND (mc.club_id = m.club_id))))
     LEFT JOIN miclub.category_catalog cc ON ((cc.id = mc.catalog_id)))
     LEFT JOIN LATERAL ( SELECT r.id,
            r.base_currency_code,
            r.quote_currency_code,
            r.rate,
            r.rate_date,
            r.rate_type,
            r.source,
            r.source_reference,
            r.fetched_at,
            r.created_at
           FROM miclub.exchange_rates r
          WHERE ((r.rate_date <= (m.movement_date)::date) AND (r.rate_type = 'official'::text) AND (((r.base_currency_code = m.currency_code) AND (r.quote_currency_code = c.base_currency_code)) OR ((r.quote_currency_code = m.currency_code) AND (r.base_currency_code = c.base_currency_code))))
          ORDER BY r.rate_date DESC, r.created_at DESC
         LIMIT 1) er ON ((m.currency_code IS DISTINCT FROM c.base_currency_code)))
  WHERE ((m.sector_id IS NOT NULL) AND (m.movement_type = 'INGRESOS'::miclub.movement_type) AND (m.operational_status = 'COMPLETADO'::miclub.movement_status) AND (lower(COALESCE((m.financial_status)::text, ''::text)) <> ALL (ARRAY['pendiente'::text, 'cancelado'::text, 'anulado'::text])) AND (COALESCE((m.source_payload ->> 'is_internal_transfer'::text), 'false'::text) <> 'true'::text) AND (upper(COALESCE(cc.code, ''::text)) <> ALL (ARRAY['CAPITAL_INICIAL'::text, 'TRANSFERENCIA_INTERNA'::text])) AND (upper(COALESCE(mc.name, ''::text)) <> ALL (ARRAY['CAPITAL INICIAL'::text, 'TRANSFERENCIA INTERNA'::text])))
  GROUP BY m.club_id, m.sector_id, (date_trunc('month'::text, ((m.movement_date)::timestamp without time zone AT TIME ZONE COALESCE(NULLIF(c.timezone, ''::text), 'America/Argentina/Buenos_Aires'::text))));


--
-- Name: v_sector_capacity_metrics; Type: VIEW; Schema: miclub; Owner: -
--

CREATE VIEW miclub.v_sector_capacity_metrics AS
 WITH enrollment_counts AS (
         SELECT a.club_id,
            a.sector_id,
            (count(e_1.id))::numeric AS active_count
           FROM (miclub.activities a
             JOIN miclub.enrollments e_1 ON (((e_1.club_id = a.club_id) AND (e_1.activity_id = a.id))))
          WHERE ((e_1.superseded_at IS NULL) AND (COALESCE(e_1.inactive, false) = false) AND (e_1.status = ANY (ARRAY['al_dia'::miclub.enrollment_status, 'nuevo_inscripto'::miclub.enrollment_status, 'adeudando'::miclub.enrollment_status])))
          GROUP BY a.club_id, a.sector_id
        ), income AS (
         SELECT monthly.club_id,
            monthly.sector_id,
            monthly.month,
            monthly.income,
            monthly.missing_exchange_rate_count,
            c.timezone,
            (date_trunc('month'::text, (now() AT TIME ZONE COALESCE(NULLIF(c.timezone, ''::text), 'America/Argentina/Buenos_Aires'::text))))::date AS current_month
           FROM (miclub.v_sector_monthly_completed_income monthly
             JOIN miclub.clubs c ON ((c.id = monthly.club_id)))
        ), income_rollup AS (
         SELECT income.club_id,
            income.sector_id,
            max(income.income) FILTER (WHERE (income.month < income.current_month)) AS historical_record,
            COALESCE(max(income.income) FILTER (WHERE (income.month = income.current_month)), (0)::numeric) AS current_income
           FROM income
          GROUP BY income.club_id, income.sector_id
        )
 SELECT s.club_id,
    s.id AS sector_id,
    s.capacity_mode,
    s.configured_capacity,
        CASE
            WHEN (s.capacity_mode = 'ENROLLMENTS'::text) THEN (s.configured_capacity)::numeric
            ELSE r.historical_record
        END AS maximum_capacity,
        CASE
            WHEN (s.capacity_mode = 'ENROLLMENTS'::text) THEN COALESCE(e.active_count, (0)::numeric)
            ELSE r.current_income
        END AS current_usage,
        CASE
            WHEN ((s.capacity_mode = 'INCOME'::text) AND (COALESCE(r.historical_record, (0)::numeric) <= (0)::numeric)) THEN NULL::numeric
            WHEN ((s.capacity_mode = 'ENROLLMENTS'::text) AND (COALESCE(s.configured_capacity, 0) <= 0)) THEN NULL::numeric
            WHEN (s.capacity_mode = 'ENROLLMENTS'::text) THEN ((COALESCE(e.active_count, (0)::numeric) * (100)::numeric) / (s.configured_capacity)::numeric)
            ELSE ((r.current_income * (100)::numeric) / r.historical_record)
        END AS utilization_percentage,
        CASE
            WHEN ((s.capacity_mode = 'INCOME'::text) AND (COALESCE(r.historical_record, (0)::numeric) <= (0)::numeric)) THEN NULL::numeric
            WHEN ((s.capacity_mode = 'ENROLLMENTS'::text) AND (COALESCE(s.configured_capacity, 0) <= 0)) THEN NULL::numeric
            WHEN (s.capacity_mode = 'ENROLLMENTS'::text) THEN GREATEST((0)::numeric, ((100)::numeric - ((COALESCE(e.active_count, (0)::numeric) * (100)::numeric) / (s.configured_capacity)::numeric)))
            ELSE GREATEST((0)::numeric, ((100)::numeric - ((r.current_income * (100)::numeric) / r.historical_record)))
        END AS idle_percentage,
        CASE
            WHEN ((s.capacity_mode = 'INCOME'::text) AND (COALESCE(r.historical_record, (0)::numeric) <= (0)::numeric)) THEN 'NO_DATA'::text
            WHEN (s.capacity_mode = ANY (ARRAY['INCOME'::text, 'ENROLLMENTS'::text])) THEN 'AVAILABLE'::text
            ELSE 'NOT_CONFIGURED'::text
        END AS data_status
   FROM ((miclub.sectors s
     LEFT JOIN enrollment_counts e ON (((e.club_id = s.club_id) AND (e.sector_id = s.id))))
     LEFT JOIN income_rollup r ON (((r.club_id = s.club_id) AND (r.sector_id = s.id))));


--
-- Name: worker_invitations; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.worker_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    invited_by uuid NOT NULL,
    membership_id uuid,
    token_hash text NOT NULL,
    worker_data jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT worker_invitations_check CHECK ((((status = 'pending'::text) AND (resolved_at IS NULL) AND (membership_id IS NULL)) OR ((status <> 'pending'::text) AND (resolved_at IS NOT NULL)))),
    CONSTRAINT worker_invitations_check1 CHECK (((status <> 'accepted'::text) OR (membership_id IS NOT NULL))),
    CONSTRAINT worker_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT worker_invitations_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE worker_invitations; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.worker_invitations IS 'Invitación tenant-scoped: la membresía y sus permisos se crean exclusivamente tras aceptación del dueño. No existe bypass administrativo.';


--
-- Name: COLUMN worker_invitations.token_hash; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.worker_invitations.token_hash IS 'SHA-256 del token aleatorio de un solo uso; el token sin hash nunca se persiste ni audita.';


--
-- Name: xlsx_import_rows; Type: TABLE; Schema: miclub; Owner: -
--

CREATE TABLE miclub.xlsx_import_rows (
    club_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    sheet text NOT NULL,
    row_fingerprint text NOT NULL,
    external_reference text,
    source_row_number integer NOT NULL,
    entity_id uuid NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xlsx_import_rows_row_fingerprint_check CHECK ((row_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT xlsx_import_rows_sheet_check CHECK ((sheet = ANY (ARRAY['ADMINISTRACIÓN'::text, 'INSCRIPCIONES'::text]))),
    CONSTRAINT xlsx_import_rows_source_row_number_check CHECK ((source_row_number >= 2))
);

ALTER TABLE ONLY miclub.xlsx_import_rows FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE xlsx_import_rows; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON TABLE miclub.xlsx_import_rows IS 'Claves versionadas, no PII, de cada fila XLSX efectivamente importada.';


--
-- Name: COLUMN xlsx_import_rows.entity_id; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON COLUMN miclub.xlsx_import_rows.entity_id IS 'Entidad creada; sin FK polimórfica porque sheet determina movements o enrollments.';


--
-- Name: crm_message_history legacy_sqlite_id; Type: DEFAULT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history ALTER COLUMN legacy_sqlite_id SET DEFAULT nextval('miclub.crm_message_history_legacy_id_seq'::regclass);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activities activities_settlement_fixed_amount_nonnegative_check; Type: CHECK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE miclub.activities
    ADD CONSTRAINT activities_settlement_fixed_amount_nonnegative_check CHECK (((settlement_fixed_amount IS NULL) OR (settlement_fixed_amount >= (0)::numeric))) NOT VALID;


--
-- Name: activities activities_settlement_fixed_amount_required_check; Type: CHECK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE miclub.activities
    ADD CONSTRAINT activities_settlement_fixed_amount_required_check CHECK (((settlement_mode IS DISTINCT FROM 'fixed'::text) OR (settlement_fixed_amount IS NOT NULL))) NOT VALID;


--
-- Name: activities activities_settlement_mode_allowed_check; Type: CHECK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE miclub.activities
    ADD CONSTRAINT activities_settlement_mode_allowed_check CHECK (((settlement_mode IS NULL) OR (settlement_mode = ANY (ARRAY['none'::text, 'percent'::text, 'fixed'::text, 'category'::text])))) NOT VALID;


--
-- Name: activity_fee_cleanup_candidates activity_fee_cleanup_candidates_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_cleanup_candidates
    ADD CONSTRAINT activity_fee_cleanup_candidates_pkey PRIMARY KEY (activity_id);


--
-- Name: activity_fee_history activity_fee_history_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_history
    ADD CONSTRAINT activity_fee_history_pkey PRIMARY KEY (id);


--
-- Name: activity_icon_aliases activity_icon_aliases_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_icon_aliases
    ADD CONSTRAINT activity_icon_aliases_pkey PRIMARY KEY (alias_key);


--
-- Name: activity_icon_catalog activity_icon_catalog_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_icon_catalog
    ADD CONSTRAINT activity_icon_catalog_pkey PRIMARY KEY (icon_key);


--
-- Name: activity_icon_catalog activity_icon_catalog_sort_order_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_icon_catalog
    ADD CONSTRAINT activity_icon_catalog_sort_order_key UNIQUE (sort_order);


--
-- Name: activity_schedules activity_schedules_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_schedules
    ADD CONSTRAINT activity_schedules_pkey PRIMARY KEY (id);


--
-- Name: activity_settlement_allocations activity_settlement_allocatio_settlement_id_movement_id_all_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlement_allocations
    ADD CONSTRAINT activity_settlement_allocatio_settlement_id_movement_id_all_key UNIQUE (settlement_id, movement_id, allocation_type);


--
-- Name: activity_settlement_allocations activity_settlement_allocations_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlement_allocations
    ADD CONSTRAINT activity_settlement_allocations_pkey PRIMARY KEY (id);


--
-- Name: activity_settlements activity_settlements_activity_id_period_from_period_to_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlements
    ADD CONSTRAINT activity_settlements_activity_id_period_from_period_to_key UNIQUE (activity_id, period_from, period_to);


--
-- Name: activity_settlements activity_settlements_id_club_id_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlements
    ADD CONSTRAINT activity_settlements_id_club_id_key UNIQUE (id, club_id);


--
-- Name: activity_settlements activity_settlements_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlements
    ADD CONSTRAINT activity_settlements_pkey PRIMARY KEY (id);


--
-- Name: activity_terms_migration_diagnostic activity_terms_migration_diagnostic_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms_migration_diagnostic
    ADD CONSTRAINT activity_terms_migration_diagnostic_pkey PRIMARY KEY (activity_id);


--
-- Name: activity_terms activity_terms_no_overlap; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_no_overlap EXCLUDE USING gist (activity_id WITH =, daterange(effective_from, COALESCE((effective_to + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: activity_terms activity_terms_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_pkey PRIMARY KEY (id);


--
-- Name: app_sessions app_sessions_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.app_sessions
    ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (id);


--
-- Name: users app_users_email_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.users
    ADD CONSTRAINT app_users_email_key UNIQUE (email);


--
-- Name: users app_users_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: billing_payment_confirmations billing_payment_confirmations_club_id_subscription_id_gatew_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.billing_payment_confirmations
    ADD CONSTRAINT billing_payment_confirmations_club_id_subscription_id_gatew_key UNIQUE (club_id, subscription_id, gateway_event_id);


--
-- Name: billing_payment_confirmations billing_payment_confirmations_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.billing_payment_confirmations
    ADD CONSTRAINT billing_payment_confirmations_pkey PRIMARY KEY (gateway_event_id);


--
-- Name: category_catalog category_catalog_code_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.category_catalog
    ADD CONSTRAINT category_catalog_code_key UNIQUE (code);


--
-- Name: category_catalog category_catalog_display_order_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.category_catalog
    ADD CONSTRAINT category_catalog_display_order_key UNIQUE (display_order);


--
-- Name: category_catalog category_catalog_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.category_catalog
    ADD CONSTRAINT category_catalog_pkey PRIMARY KEY (id);


--
-- Name: category_import_aliases category_import_aliases_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.category_import_aliases
    ADD CONSTRAINT category_import_aliases_pkey PRIMARY KEY (normalized_alias);


--
-- Name: club_capabilities club_capabilities_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_capabilities
    ADD CONSTRAINT club_capabilities_pkey PRIMARY KEY (id);


--
-- Name: club_memberships club_memberships_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_memberships
    ADD CONSTRAINT club_memberships_pkey PRIMARY KEY (id);


--
-- Name: club_onboarding club_onboarding_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_onboarding
    ADD CONSTRAINT club_onboarding_pkey PRIMARY KEY (club_id);


--
-- Name: club_subscriptions club_subscriptions_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_subscriptions
    ADD CONSTRAINT club_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: crm_message_history crm_history_club_legacy_unique; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_history_club_legacy_unique UNIQUE (club_id, legacy_sqlite_id);


--
-- Name: crm_message_history crm_message_history_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_message_history_pkey PRIMARY KEY (id);


--
-- Name: crm_message_templates crm_message_templates_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_templates
    ADD CONSTRAINT crm_message_templates_pkey PRIMARY KEY (club_id, id);


--
-- Name: crm_message_templates crm_templates_club_legacy_unique; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_templates
    ADD CONSTRAINT crm_templates_club_legacy_unique UNIQUE (club_id, legacy_sqlite_id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- Name: discount_rates discount_rates_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.discount_rates
    ADD CONSTRAINT discount_rates_pkey PRIMARY KEY (id);


--
-- Name: employee_photos employee_photos_club_id_object_key_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employee_photos
    ADD CONSTRAINT employee_photos_club_id_object_key_key UNIQUE (club_id, object_key);


--
-- Name: employee_photos employee_photos_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employee_photos
    ADD CONSTRAINT employee_photos_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: enrollment_fee_audit enrollment_fee_audit_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollment_fee_audit
    ADD CONSTRAINT enrollment_fee_audit_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_club_sequence_number_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollments
    ADD CONSTRAINT enrollments_club_sequence_number_key UNIQUE (club_id, sequence_number);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: exchange_rate_sync_state exchange_rate_sync_state_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_sync_state
    ADD CONSTRAINT exchange_rate_sync_state_pkey PRIMARY KEY (source);


--
-- Name: exchange_rate_usage_components exchange_rate_usage_component_exchange_rate_usage_id_exchan_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usage_components
    ADD CONSTRAINT exchange_rate_usage_component_exchange_rate_usage_id_exchan_key UNIQUE (exchange_rate_usage_id, exchange_rate_id);


--
-- Name: exchange_rate_usage_components exchange_rate_usage_components_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usage_components
    ADD CONSTRAINT exchange_rate_usage_components_pkey PRIMARY KEY (exchange_rate_usage_id, component_order);


--
-- Name: exchange_rate_usages exchange_rate_usages_club_id_usage_type_usage_reference_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usages
    ADD CONSTRAINT exchange_rate_usages_club_id_usage_type_usage_reference_key UNIQUE (club_id, usage_type, usage_reference);


--
-- Name: exchange_rate_usages exchange_rate_usages_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usages
    ADD CONSTRAINT exchange_rate_usages_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_natural_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rates
    ADD CONSTRAINT exchange_rates_natural_key UNIQUE (base_currency_code, quote_currency_code, rate_date, rate_type, source);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (code);


--
-- Name: financial_accounts financial_accounts_club_code_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.financial_accounts
    ADD CONSTRAINT financial_accounts_club_code_key UNIQUE (club_id, code);


--
-- Name: financial_accounts financial_accounts_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.financial_accounts
    ADD CONSTRAINT financial_accounts_pkey PRIMARY KEY (id);


--
-- Name: import_amount_normalization_rules import_amount_normalization_rules_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_amount_normalization_rules
    ADD CONSTRAINT import_amount_normalization_rules_pkey PRIMARY KEY (context);


--
-- Name: import_batches import_batches_id_club_unique; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_batches
    ADD CONSTRAINT import_batches_id_club_unique UNIQUE (id, club_id);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);


--
-- Name: import_errors import_errors_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_errors
    ADD CONSTRAINT import_errors_pkey PRIMARY KEY (id);


--
-- Name: instructors instructors_id_club_id_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.instructors
    ADD CONSTRAINT instructors_id_club_id_key UNIQUE (id, club_id);


--
-- Name: instructors instructors_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.instructors
    ADD CONSTRAINT instructors_pkey PRIMARY KEY (id);


--
-- Name: movement_categories movement_categories_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movement_categories
    ADD CONSTRAINT movement_categories_pkey PRIMARY KEY (id);


--
-- Name: movements movements_club_sequence_number_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_club_sequence_number_key UNIQUE (club_id, sequence_number);


--
-- Name: movements movements_id_club_id_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_id_club_id_key UNIQUE (id, club_id);


--
-- Name: movements movements_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_pkey PRIMARY KEY (id);


--
-- Name: onboarding_operations onboarding_operations_club_id_operation_idempotency_key_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.onboarding_operations
    ADD CONSTRAINT onboarding_operations_club_id_operation_idempotency_key_key UNIQUE (club_id, operation, idempotency_key);


--
-- Name: onboarding_operations onboarding_operations_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.onboarding_operations
    ADD CONSTRAINT onboarding_operations_pkey PRIMARY KEY (club_id, operation);


--
-- Name: opening_balance_batches opening_balance_batches_club_idempotency_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_batches
    ADD CONSTRAINT opening_balance_batches_club_idempotency_key UNIQUE (club_id, idempotency_key);


--
-- Name: opening_balance_batches opening_balance_batches_club_revision_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_batches
    ADD CONSTRAINT opening_balance_batches_club_revision_key UNIQUE (club_id, revision);


--
-- Name: opening_balance_batches opening_balance_batches_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_batches
    ADD CONSTRAINT opening_balance_batches_pkey PRIMARY KEY (id);


--
-- Name: opening_balance_movements opening_balance_movements_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_movements
    ADD CONSTRAINT opening_balance_movements_pkey PRIMARY KEY (movement_id);


--
-- Name: operational_balances operational_balances_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.operational_balances
    ADD CONSTRAINT operational_balances_pkey PRIMARY KEY (id);


--
-- Name: payment_allocations payment_allocations_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payment_allocations
    ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: people people_id_club_id_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.people
    ADD CONSTRAINT people_id_club_id_key UNIQUE (id, club_id);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: person_kind_links person_kind_links_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.person_kind_links
    ADD CONSTRAINT person_kind_links_pkey PRIMARY KEY (club_id, person_id, kind);


--
-- Name: plan_entitlements plan_entitlements_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.plan_entitlements
    ADD CONSTRAINT plan_entitlements_pkey PRIMARY KEY (plan_code, feature_code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (code);


--
-- Name: rate_limit_buckets rate_limit_buckets_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.rate_limit_buckets
    ADD CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (bucket_key, window_start);


--
-- Name: receivables receivables_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.receivables
    ADD CONSTRAINT receivables_pkey PRIMARY KEY (id);


--
-- Name: roles roles_club_code_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.roles
    ADD CONSTRAINT roles_club_code_key UNIQUE (club_id, code);


--
-- Name: roles roles_id_club_unique; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.roles
    ADD CONSTRAINT roles_id_club_unique UNIQUE (id, club_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: salon_hour_prices salon_hour_prices_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.salon_hour_prices
    ADD CONSTRAINT salon_hour_prices_pkey PRIMARY KEY (id);


--
-- Name: sector_settlements sector_settlements_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sector_settlements
    ADD CONSTRAINT sector_settlements_pkey PRIMARY KEY (id);


--
-- Name: sector_templates sector_templates_code_uk; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sector_templates
    ADD CONSTRAINT sector_templates_code_uk UNIQUE (code);


--
-- Name: sector_templates sector_templates_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sector_templates
    ADD CONSTRAINT sector_templates_pkey PRIMARY KEY (id);


--
-- Name: sectors sectors_id_club_id_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_id_club_id_key UNIQUE (id, club_id);


--
-- Name: sectors sectors_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_pkey PRIMARY KEY (id);


--
-- Name: sheet_metric_snapshots sheet_metric_snapshots_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sheet_metric_snapshots
    ADD CONSTRAINT sheet_metric_snapshots_pkey PRIMARY KEY (club_id, metric_key, captured_at);


--
-- Name: system_months system_months_name_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.system_months
    ADD CONSTRAINT system_months_name_key UNIQUE (name);


--
-- Name: system_months system_months_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.system_months
    ADD CONSTRAINT system_months_pkey PRIMARY KEY (month_number);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tenant_sequences tenant_sequences_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tenant_sequences
    ADD CONSTRAINT tenant_sequences_pkey PRIMARY KEY (club_id, entity_type);


--
-- Name: user_club_memberships user_club_memberships_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.user_club_memberships
    ADD CONSTRAINT user_club_memberships_pkey PRIMARY KEY (id);


--
-- Name: user_club_memberships user_club_memberships_user_id_club_id_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.user_club_memberships
    ADD CONSTRAINT user_club_memberships_user_id_club_id_key UNIQUE (user_id, club_id);


--
-- Name: worker_invitations worker_invitations_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_pkey PRIMARY KEY (id);


--
-- Name: worker_invitations worker_invitations_token_hash_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: xlsx_import_rows xlsx_import_rows_club_id_batch_id_sheet_source_row_number_key; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.xlsx_import_rows
    ADD CONSTRAINT xlsx_import_rows_club_id_batch_id_sheet_source_row_number_key UNIQUE (club_id, batch_id, sheet, source_row_number);


--
-- Name: xlsx_import_rows xlsx_import_rows_pkey; Type: CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.xlsx_import_rows
    ADD CONSTRAINT xlsx_import_rows_pkey PRIMARY KEY (club_id, batch_id, sheet, row_fingerprint);


--
-- Name: activities_archived_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_archived_at_idx ON miclub.activities USING btree (archived_at);


--
-- Name: activities_club_active_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_club_active_idx ON miclub.activities USING btree (club_id, sector_id) WHERE (archived_at IS NULL);


--
-- Name: activities_club_code_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX activities_club_code_key ON miclub.activities USING btree (club_id, lower(code)) WHERE (code IS NOT NULL);


--
-- Name: activities_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_club_id_idx ON miclub.activities USING btree (club_id);


--
-- Name: activities_club_sector_normalized_name_modality_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX activities_club_sector_normalized_name_modality_key ON miclub.activities USING btree (club_id, sector_id, lower(name), COALESCE(lower(modality), ''::text));


--
-- Name: activities_created_by_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_created_by_idx ON miclub.activities USING btree (created_by);


--
-- Name: activities_id_club_unique; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX activities_id_club_unique ON miclub.activities USING btree (id, club_id);


--
-- Name: activities_import_conflict_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX activities_import_conflict_key ON miclub.activities USING btree (club_id, sector_id, lower(name), COALESCE(modality, ''::text));


--
-- Name: activities_instructor_club_fkey_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_instructor_club_fkey_idx ON miclub.activities USING btree (instructor_id, club_id) WHERE (instructor_id IS NOT NULL);


--
-- Name: activities_manager_person_club_fkey_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_manager_person_club_fkey_idx ON miclub.activities USING btree (manager_person_id, club_id) WHERE (manager_person_id IS NOT NULL);


--
-- Name: activities_sector_club_fkey_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_sector_club_fkey_idx ON miclub.activities USING btree (sector_id, club_id);


--
-- Name: activities_settlement_category_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_settlement_category_id_idx ON miclub.activities USING btree (settlement_category_id);


--
-- Name: activities_settlement_mode_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_settlement_mode_idx ON miclub.activities USING btree (settlement_mode);


--
-- Name: activities_updated_by_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activities_updated_by_idx ON miclub.activities USING btree (updated_by);


--
-- Name: activity_fee_history_activity_changed_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activity_fee_history_activity_changed_idx ON miclub.activity_fee_history USING btree (activity_id, changed_at DESC);


--
-- Name: activity_settlement_allocations_active_movement_type_unique; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX activity_settlement_allocations_active_movement_type_unique ON miclub.activity_settlement_allocations USING btree (club_id, movement_id, allocation_type) WHERE ((movement_id IS NOT NULL) AND (status <> 'CANCELADO'::text) AND (voided_at IS NULL));


--
-- Name: INDEX activity_settlement_allocations_active_movement_type_unique; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON INDEX miclub.activity_settlement_allocations_active_movement_type_unique IS 'PAYMENT y ADVANCE son indivisibles: un movimiento sólo puede estar asignado a una liquidación no cancelada por tipo.';


--
-- Name: activity_settlement_allocations_settlement_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activity_settlement_allocations_settlement_idx ON miclub.activity_settlement_allocations USING btree (club_id, settlement_id) WHERE (voided_at IS NULL);


--
-- Name: activity_settlements_club_period_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX activity_settlements_club_period_idx ON miclub.activity_settlements USING btree (club_id, period_from, period_to);


--
-- Name: activity_terms_id_activity_club_unique; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX activity_terms_id_activity_club_unique ON miclub.activity_terms USING btree (id, activity_id, club_id);


--
-- Name: app_sessions_active_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX app_sessions_active_idx ON miclub.app_sessions USING btree (id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: approval_requests_assigned_membership_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX approval_requests_assigned_membership_idx ON miclub.approval_requests USING btree (assigned_to_membership_id) WHERE (assigned_to_membership_id IS NOT NULL);


--
-- Name: approval_requests_club_status_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX approval_requests_club_status_idx ON miclub.approval_requests USING btree (club_id, status, created_at DESC);


--
-- Name: approval_requests_decided_membership_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX approval_requests_decided_membership_idx ON miclub.approval_requests USING btree (decided_by_membership_id) WHERE (decided_by_membership_id IS NOT NULL);


--
-- Name: approval_requests_requested_membership_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX approval_requests_requested_membership_idx ON miclub.approval_requests USING btree (requested_by_membership_id) WHERE (requested_by_membership_id IS NOT NULL);


--
-- Name: audit_log_action_created_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX audit_log_action_created_at_idx ON miclub.audit_log USING btree (action, created_at DESC);


--
-- Name: audit_log_club_created_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX audit_log_club_created_at_idx ON miclub.audit_log USING btree (club_id, created_at DESC);


--
-- Name: audit_log_membership_created_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX audit_log_membership_created_at_idx ON miclub.audit_log USING btree (membership_id, created_at DESC);


--
-- Name: audit_log_request_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX audit_log_request_id_idx ON miclub.audit_log USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: club_capabilities_effective_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX club_capabilities_effective_idx ON miclub.club_capabilities USING btree (club_id, effective_from, effective_until);


--
-- Name: club_memberships_club_person_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX club_memberships_club_person_key ON miclub.club_memberships USING btree (club_id, person_id);


--
-- Name: club_memberships_number_unique_not_null; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX club_memberships_number_unique_not_null ON miclub.club_memberships USING btree (club_id, lower(membership_number)) WHERE (membership_number IS NOT NULL);


--
-- Name: club_memberships_person_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX club_memberships_person_idx ON miclub.club_memberships USING btree (person_id);


--
-- Name: club_memberships_status_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX club_memberships_status_idx ON miclub.club_memberships USING btree (club_id, status);


--
-- Name: club_subscriptions_effective_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX club_subscriptions_effective_idx ON miclub.club_subscriptions USING btree (club_id, effective_from, effective_until);


--
-- Name: clubs_active_name_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX clubs_active_name_idx ON miclub.clubs USING btree (is_active, lower(name));


--
-- Name: clubs_code_unique_not_null; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX clubs_code_unique_not_null ON miclub.clubs USING btree (lower(code)) WHERE (code IS NOT NULL);


--
-- Name: crm_history_club_created_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX crm_history_club_created_idx ON miclub.crm_message_history USING btree (club_id, created_at DESC);


--
-- Name: crm_history_club_member_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX crm_history_club_member_idx ON miclub.crm_message_history USING btree (club_id, member_id);


--
-- Name: crm_templates_active_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX crm_templates_active_idx ON miclub.crm_message_templates USING btree (club_id, is_default DESC, created_at) WHERE (archived_at IS NULL);


--
-- Name: discount_rates_club_percent_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX discount_rates_club_percent_key ON miclub.discount_rates USING btree (club_id, percent);


--
-- Name: employee_photos_expiry; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX employee_photos_expiry ON miclub.employee_photos USING btree (expires_at) WHERE (status = 'temporary'::text);


--
-- Name: employee_photos_one_active; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX employee_photos_one_active ON miclub.employee_photos USING btree (club_id, employee_id) WHERE (status = 'active'::text);


--
-- Name: employees_club_person_active_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX employees_club_person_active_key ON miclub.employees USING btree (club_id, person_id) WHERE ((archived_at IS NULL) AND (status <> 'terminated'::text));


--
-- Name: employees_club_sector_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX employees_club_sector_idx ON miclub.employees USING btree (club_id, sector_id) WHERE (sector_id IS NOT NULL);


--
-- Name: employees_club_status_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX employees_club_status_idx ON miclub.employees USING btree (club_id, status);


--
-- Name: employees_membership_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX employees_membership_id_idx ON miclub.employees USING btree (membership_id) WHERE (membership_id IS NOT NULL);


--
-- Name: employees_user_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX employees_user_id_idx ON miclub.employees USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: enrollment_fee_audit_created_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollment_fee_audit_created_at_idx ON miclub.enrollment_fee_audit USING btree (created_at DESC);


--
-- Name: enrollment_fee_audit_enrollment_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollment_fee_audit_enrollment_id_idx ON miclub.enrollment_fee_audit USING btree (enrollment_id);


--
-- Name: enrollment_fee_audit_import_batch_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollment_fee_audit_import_batch_id_idx ON miclub.enrollment_fee_audit USING btree (import_batch_id);


--
-- Name: enrollment_fee_audit_source_sheet_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollment_fee_audit_source_sheet_idx ON miclub.enrollment_fee_audit USING btree (source_sheet);


--
-- Name: enrollments_activity_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_activity_id_idx ON miclub.enrollments USING btree (activity_id);


--
-- Name: enrollments_club_activity_person_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_club_activity_person_idx ON miclub.enrollments USING btree (club_id, activity_id, person_id);


--
-- Name: enrollments_club_external_id_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX enrollments_club_external_id_key ON miclub.enrollments USING btree (club_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: enrollments_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_club_id_idx ON miclub.enrollments USING btree (club_id);


--
-- Name: enrollments_due_date_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_due_date_idx ON miclub.enrollments USING btree (due_date);


--
-- Name: enrollments_enrollment_date_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_enrollment_date_idx ON miclub.enrollments USING btree (enrollment_date);


--
-- Name: enrollments_google_sheets_active_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_google_sheets_active_idx ON miclub.enrollments USING btree (source, external_id) WHERE ((source = 'google_sheets'::text) AND (inactive = false) AND (superseded_at IS NULL));


--
-- Name: enrollments_missing_review_batch_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_missing_review_batch_idx ON miclub.enrollments USING btree (missing_from_import_batch_id) WHERE (missing_from_import_batch_id IS NOT NULL);


--
-- Name: enrollments_person_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX enrollments_person_id_idx ON miclub.enrollments USING btree (person_id);


--
-- Name: exchange_rates_lookup_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX exchange_rates_lookup_idx ON miclub.exchange_rates USING btree (base_currency_code, quote_currency_code, rate_type, rate_date DESC);


--
-- Name: financial_accounts_club_status_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX financial_accounts_club_status_idx ON miclub.financial_accounts USING btree (club_id, status, code);


--
-- Name: idx_activities_instructor; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_activities_instructor ON miclub.activities USING btree (instructor_id);


--
-- Name: idx_activities_sector; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_activities_sector ON miclub.activities USING btree (sector_id);


--
-- Name: idx_activities_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_activities_status ON miclub.activities USING btree (status);


--
-- Name: idx_crm_history_created_at; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_crm_history_created_at ON miclub.crm_message_history USING btree (created_at);


--
-- Name: idx_crm_history_person; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_crm_history_person ON miclub.crm_message_history USING btree (person_id);


--
-- Name: idx_crm_history_phone; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_crm_history_phone ON miclub.crm_message_history USING btree (phone);


--
-- Name: idx_crm_history_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_crm_history_status ON miclub.crm_message_history USING btree (status);


--
-- Name: idx_discount_rates_percent; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_discount_rates_percent ON miclub.discount_rates USING btree (percent);


--
-- Name: idx_enrollments_activity; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_enrollments_activity ON miclub.enrollments USING btree (activity_id);


--
-- Name: idx_enrollments_due_date; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_enrollments_due_date ON miclub.enrollments USING btree (due_date);


--
-- Name: idx_enrollments_person; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_enrollments_person ON miclub.enrollments USING btree (person_id);


--
-- Name: idx_enrollments_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_enrollments_status ON miclub.enrollments USING btree (status);


--
-- Name: idx_instructors_display_name; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_instructors_display_name ON miclub.instructors USING btree (display_name);


--
-- Name: idx_movements_category; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_movements_category ON miclub.movements USING btree (category_id);


--
-- Name: idx_movements_date; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_movements_date ON miclub.movements USING btree (movement_date);


--
-- Name: idx_movements_external_id; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_movements_external_id ON miclub.movements USING btree (external_id);


--
-- Name: idx_movements_sector; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_movements_sector ON miclub.movements USING btree (sector_id);


--
-- Name: idx_movements_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_movements_status ON miclub.movements USING btree (operational_status);


--
-- Name: idx_movements_type; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_movements_type ON miclub.movements USING btree (movement_type);


--
-- Name: idx_payments_paid_at; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_payments_paid_at ON miclub.payments USING btree (paid_at);


--
-- Name: idx_payments_person; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_payments_person ON miclub.payments USING btree (person_id);


--
-- Name: idx_people_dni; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_people_dni ON miclub.people USING btree (dni);


--
-- Name: idx_people_phone; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_people_phone ON miclub.people USING btree (normalized_phone);


--
-- Name: idx_people_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_people_status ON miclub.people USING btree (status);


--
-- Name: idx_receivables_due_date; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_receivables_due_date ON miclub.receivables USING btree (due_date);


--
-- Name: idx_receivables_enrollment; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_receivables_enrollment ON miclub.receivables USING btree (enrollment_id);


--
-- Name: idx_receivables_person; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_receivables_person ON miclub.receivables USING btree (person_id);


--
-- Name: idx_receivables_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_receivables_status ON miclub.receivables USING btree (status);


--
-- Name: idx_salon_hour_prices_hours; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_salon_hour_prices_hours ON miclub.salon_hour_prices USING btree (hours);


--
-- Name: idx_sectors_status; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX idx_sectors_status ON miclub.sectors USING btree (operational_status);


--
-- Name: import_batches_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX import_batches_club_id_idx ON miclub.import_batches USING btree (club_id);


--
-- Name: import_batches_exact_real_batch_uidx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX import_batches_exact_real_batch_uidx ON miclub.import_batches USING btree (club_id, batch_identity) WHERE ((source = 'xlsx'::text) AND (operation_type = 'apply'::text) AND (status = 'completed'::text));


--
-- Name: import_batches_idempotency_unique; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX import_batches_idempotency_unique ON miclub.import_batches USING btree (club_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: import_batches_secure_dry_run_lookup; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX import_batches_secure_dry_run_lookup ON miclub.import_batches USING btree (club_id, file_sha256, template_version, reference_config_hash, status);


--
-- Name: import_errors_batch_id_created_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX import_errors_batch_id_created_at_idx ON miclub.import_errors USING btree (batch_id, created_at);


--
-- Name: import_errors_batch_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX import_errors_batch_id_idx ON miclub.import_errors USING btree (batch_id, created_at);


--
-- Name: import_errors_club_batch_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX import_errors_club_batch_idx ON miclub.import_errors USING btree (club_id, batch_id);


--
-- Name: instructors_club_person_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX instructors_club_person_key ON miclub.instructors USING btree (club_id, person_id) WHERE (person_id IS NOT NULL);


--
-- Name: instructors_import_conflict_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX instructors_import_conflict_key ON miclub.instructors USING btree (club_id, person_id);


--
-- Name: movement_categories_catalog_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movement_categories_catalog_id_idx ON miclub.movement_categories USING btree (catalog_id);


--
-- Name: movement_categories_club_normalized_name_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX movement_categories_club_normalized_name_key ON miclub.movement_categories USING btree (club_id, upper(TRIM(BOTH FROM name)));


--
-- Name: movements_activity_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_activity_id_idx ON miclub.movements USING btree (activity_id);


--
-- Name: movements_category_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_category_id_idx ON miclub.movements USING btree (category_id);


--
-- Name: movements_club_account_completed_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_club_account_completed_idx ON miclub.movements USING btree (club_id, account_id, movement_date) WHERE ((operational_status = 'COMPLETADO'::miclub.movement_status) AND (voided_at IS NULL));


--
-- Name: movements_club_activity_date_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_club_activity_date_idx ON miclub.movements USING btree (club_id, activity_id, movement_date DESC);


--
-- Name: movements_club_activity_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_club_activity_idx ON miclub.movements USING btree (club_id, activity_id) WHERE (activity_id IS NOT NULL);


--
-- Name: movements_club_external_id_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX movements_club_external_id_key ON miclub.movements USING btree (club_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: movements_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_club_id_idx ON miclub.movements USING btree (club_id);


--
-- Name: movements_club_idempotency_key_uidx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX movements_club_idempotency_key_uidx ON miclub.movements USING btree (club_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: movements_club_reconciled_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_club_reconciled_idx ON miclub.movements USING btree (club_id, reconciled_at) WHERE (reconciled_at IS NOT NULL);


--
-- Name: movements_date_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_date_idx ON miclub.movements USING btree (movement_date DESC);


--
-- Name: movements_payment_method_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_payment_method_id_idx ON miclub.movements USING btree (payment_method_id);


--
-- Name: movements_person_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_person_id_idx ON miclub.movements USING btree (person_id);


--
-- Name: movements_sector_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX movements_sector_id_idx ON miclub.movements USING btree (sector_id);


--
-- Name: opening_balance_one_account_per_batch_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX opening_balance_one_account_per_batch_idx ON miclub.opening_balance_movements USING btree (batch_id, COALESCE(reverses_movement_id, movement_id));


--
-- Name: operational_balances_club_source_cutoff_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX operational_balances_club_source_cutoff_key ON miclub.operational_balances USING btree (club_id, source, cutoff_date);


--
-- Name: operational_balances_cutoff_date_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX operational_balances_cutoff_date_idx ON miclub.operational_balances USING btree (cutoff_date DESC, created_at DESC);


--
-- Name: payment_allocations_club_payment_receivable_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX payment_allocations_club_payment_receivable_key ON miclub.payment_allocations USING btree (club_id, payment_id, receivable_id);


--
-- Name: payment_methods_club_normalized_name_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX payment_methods_club_normalized_name_key ON miclub.payment_methods USING btree (club_id, lower(name));


--
-- Name: payments_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX payments_club_id_idx ON miclub.payments USING btree (club_id);


--
-- Name: people_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX people_club_id_idx ON miclub.people USING btree (club_id);


--
-- Name: people_club_normalized_dni_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX people_club_normalized_dni_key ON miclub.people USING btree (club_id, normalized_dni) WHERE (normalized_dni IS NOT NULL);


--
-- Name: people_club_user_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX people_club_user_key ON miclub.people USING btree (club_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: people_name_phone_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX people_name_phone_idx ON miclub.people USING btree (lower(first_name), lower(last_name), COALESCE(normalized_phone, ''::text));


--
-- Name: people_user_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX people_user_id_idx ON miclub.people USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: plans_catalog_display_order_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX plans_catalog_display_order_idx ON miclub.plans USING btree (display_order) WHERE (catalog_status = 'catalog'::text);


--
-- Name: plans_one_free_commercial_plan_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX plans_one_free_commercial_plan_idx ON miclub.plans USING btree (commercial_class) WHERE (commercial_class = 'free'::text);


--
-- Name: rate_limit_buckets_expiry_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX rate_limit_buckets_expiry_idx ON miclub.rate_limit_buckets USING btree (expires_at);


--
-- Name: receivables_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX receivables_club_id_idx ON miclub.receivables USING btree (club_id);


--
-- Name: salon_hour_prices_club_hours_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX salon_hour_prices_club_hours_key ON miclub.salon_hour_prices USING btree (club_id, hours);


--
-- Name: sectors_active_club_capacity_mode_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_active_club_capacity_mode_idx ON miclub.sectors USING btree (club_id, capacity_mode) WHERE ((archived_at IS NULL) AND (status = ANY (ARRAY['active'::text, 'activa'::text])));


--
-- Name: sectors_archived_at_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_archived_at_idx ON miclub.sectors USING btree (archived_at);


--
-- Name: sectors_club_capacity_mode_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_club_capacity_mode_idx ON miclub.sectors USING btree (club_id, capacity_mode);


--
-- Name: sectors_club_code_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX sectors_club_code_key ON miclub.sectors USING btree (club_id, lower(code)) WHERE (code IS NOT NULL);


--
-- Name: sectors_club_id_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_club_id_idx ON miclub.sectors USING btree (club_id);


--
-- Name: sectors_club_normalized_name_key; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX sectors_club_normalized_name_key ON miclub.sectors USING btree (club_id, lower(name));


--
-- Name: sectors_club_template_active_uk; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX sectors_club_template_active_uk ON miclub.sectors USING btree (club_id, template_id) WHERE ((template_id IS NOT NULL) AND (archived_at IS NULL));


--
-- Name: sectors_created_by_club_fkey_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_created_by_club_fkey_idx ON miclub.sectors USING btree (created_by, club_id) WHERE (created_by IS NOT NULL);


--
-- Name: sectors_created_by_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_created_by_idx ON miclub.sectors USING btree (created_by);


--
-- Name: sectors_manager_person_club_fkey_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_manager_person_club_fkey_idx ON miclub.sectors USING btree (manager_person_id, club_id) WHERE (manager_person_id IS NOT NULL);


--
-- Name: sectors_status_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_status_idx ON miclub.sectors USING btree (status);


--
-- Name: sectors_updated_by_club_fkey_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_updated_by_club_fkey_idx ON miclub.sectors USING btree (updated_by, club_id) WHERE (updated_by IS NOT NULL);


--
-- Name: sectors_updated_by_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sectors_updated_by_idx ON miclub.sectors USING btree (updated_by);


--
-- Name: sheet_metric_snapshots_metric_captured_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX sheet_metric_snapshots_metric_captured_idx ON miclub.sheet_metric_snapshots USING btree (metric_key, captured_at DESC);


--
-- Name: tasks_active_due_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX tasks_active_due_idx ON miclub.tasks USING btree (club_id, due_at) WHERE ((archived_at IS NULL) AND (due_at IS NOT NULL));


--
-- Name: tasks_assigned_membership_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX tasks_assigned_membership_idx ON miclub.tasks USING btree (assigned_to_membership_id) WHERE (assigned_to_membership_id IS NOT NULL);


--
-- Name: tasks_assigned_user_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX tasks_assigned_user_idx ON miclub.tasks USING btree (assigned_to_user_id) WHERE (assigned_to_user_id IS NOT NULL);


--
-- Name: tasks_club_active_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX tasks_club_active_idx ON miclub.tasks USING btree (club_id, created_at DESC) WHERE (archived_at IS NULL);


--
-- Name: tasks_club_due_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX tasks_club_due_idx ON miclub.tasks USING btree (club_id, due_at) WHERE ((archived_at IS NULL) AND (due_at IS NOT NULL));


--
-- Name: tasks_club_status_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX tasks_club_status_idx ON miclub.tasks USING btree (club_id, status, created_at DESC);


--
-- Name: user_club_memberships_active_user_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX user_club_memberships_active_user_idx ON miclub.user_club_memberships USING btree (user_id) WHERE (status = 'active'::text);


--
-- Name: users_email_unique_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX users_email_unique_idx ON miclub.users USING btree (email);


--
-- Name: worker_invitations_expiration; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX worker_invitations_expiration ON miclub.worker_invitations USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: worker_invitations_pending_tenant_user; Type: INDEX; Schema: miclub; Owner: -
--

CREATE UNIQUE INDEX worker_invitations_pending_tenant_user ON miclub.worker_invitations USING btree (club_id, user_id) WHERE (status = 'pending'::text);


--
-- Name: xlsx_import_rows_external_reference_idx; Type: INDEX; Schema: miclub; Owner: -
--

CREATE INDEX xlsx_import_rows_external_reference_idx ON miclub.xlsx_import_rows USING btree (club_id, sheet, external_reference) WHERE (external_reference IS NOT NULL);


--
-- Name: activities activities_guard_delete; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER activities_guard_delete BEFORE DELETE ON miclub.activities FOR EACH ROW EXECUTE FUNCTION miclub.guard_activity_delete();


--
-- Name: activities activities_require_instructor; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE CONSTRAINT TRIGGER activities_require_instructor AFTER INSERT OR UPDATE OF instructor_id, status, archived_at ON miclub.activities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION miclub.assert_activity_has_instructor();


--
-- Name: activities activities_sync_enrollment_fee; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER activities_sync_enrollment_fee AFTER UPDATE OF monthly_fee ON miclub.activities FOR EACH ROW EXECUTE FUNCTION miclub.sync_activity_enrollment_fee();


--
-- Name: activities activities_validate_mutation; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER activities_validate_mutation BEFORE INSERT OR UPDATE ON miclub.activities FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_mutation();


--
-- Name: activity_terms activity_terms_contiguous; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE CONSTRAINT TRIGGER activity_terms_contiguous AFTER INSERT OR DELETE OR UPDATE ON miclub.activity_terms DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION miclub.validate_activity_terms_contiguous();


--
-- Name: exchange_rates exchange_rates_immutable; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER exchange_rates_immutable BEFORE DELETE OR UPDATE ON miclub.exchange_rates FOR EACH ROW EXECUTE FUNCTION miclub.reject_exchange_rate_mutation();


--
-- Name: movement_categories movement_categories_require_catalog_on_insert; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER movement_categories_require_catalog_on_insert BEFORE INSERT ON miclub.movement_categories FOR EACH ROW EXECUTE FUNCTION miclub.require_movement_category_catalog();


--
-- Name: movements movements_protect_finalized; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER movements_protect_finalized BEFORE UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.protect_finalized_movement();


--
-- Name: movements movements_reject_physical_delete; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER movements_reject_physical_delete BEFORE DELETE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.reject_financial_fact_delete();


--
-- Name: movements movements_validate_void; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER movements_validate_void BEFORE INSERT OR UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.validate_movement_void();


--
-- Name: payments payments_reject_physical_delete; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER payments_reject_physical_delete BEFORE DELETE ON miclub.payments FOR EACH ROW EXECUTE FUNCTION miclub.reject_financial_fact_delete();


--
-- Name: activities trg_activities_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_activities_updated_at BEFORE UPDATE ON miclub.activities FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: approval_requests trg_approval_requests_audit_mutation; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_approval_requests_audit_mutation AFTER INSERT OR DELETE OR UPDATE ON miclub.approval_requests FOR EACH ROW EXECUTE FUNCTION miclub.audit_tasks_and_approvals_mutation();


--
-- Name: approval_requests trg_approval_requests_validate_tenant_refs; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_approval_requests_validate_tenant_refs BEFORE INSERT OR UPDATE ON miclub.approval_requests FOR EACH ROW EXECUTE FUNCTION miclub.validate_tasks_and_approvals_tenant_refs();


--
-- Name: crm_message_templates trg_crm_templates_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_crm_templates_updated_at BEFORE UPDATE ON miclub.crm_message_templates FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: employees trg_employees_validate_tenant_refs; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_employees_validate_tenant_refs BEFORE INSERT OR UPDATE ON miclub.employees FOR EACH ROW EXECUTE FUNCTION miclub.validate_employee_tenant_refs();


--
-- Name: enrollments trg_enrollments_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_enrollments_updated_at BEFORE UPDATE ON miclub.enrollments FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: instructors trg_instructors_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_instructors_updated_at BEFORE UPDATE ON miclub.instructors FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: movements trg_movements_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_movements_updated_at BEFORE UPDATE ON miclub.movements FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: people trg_people_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON miclub.people FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: receivables trg_receivables_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_receivables_updated_at BEFORE UPDATE ON miclub.receivables FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: sectors trg_sectors_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_sectors_updated_at BEFORE UPDATE ON miclub.sectors FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: tasks trg_tasks_audit_mutation; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_tasks_audit_mutation AFTER INSERT OR DELETE OR UPDATE ON miclub.tasks FOR EACH ROW EXECUTE FUNCTION miclub.audit_tasks_and_approvals_mutation();


--
-- Name: tasks trg_tasks_validate_tenant_refs; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_tasks_validate_tenant_refs BEFORE INSERT OR UPDATE ON miclub.tasks FOR EACH ROW EXECUTE FUNCTION miclub.validate_tasks_and_approvals_tenant_refs();


--
-- Name: user_club_memberships trg_user_club_memberships_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_user_club_memberships_updated_at BEFORE UPDATE ON miclub.user_club_memberships FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: miclub; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON miclub.users FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();


--
-- Name: activities activities_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: activities activities_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.people(id) NOT VALID;


--
-- Name: activities activities_icon_key_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_icon_key_fkey FOREIGN KEY (icon_key) REFERENCES miclub.activity_icon_catalog(icon_key);


--
-- Name: activities activities_instructor_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_instructor_tenant_fkey FOREIGN KEY (instructor_id, club_id) REFERENCES miclub.instructors(id, club_id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT activities_instructor_tenant_fkey ON activities; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON CONSTRAINT activities_instructor_tenant_fkey ON miclub.activities IS 'Tenant-scoped canonical instructor reference; deletion is restricted while activities refer to it.';


--
-- Name: activities activities_manager_person_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_manager_person_tenant_fkey FOREIGN KEY (manager_person_id, club_id) REFERENCES miclub.people(id, club_id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT activities_manager_person_tenant_fkey ON activities; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON CONSTRAINT activities_manager_person_tenant_fkey ON miclub.activities IS 'Tenant-scoped legacy manager reference; deletion is restricted until the relationship is retired.';


--
-- Name: activities activities_sector_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_sector_tenant_fkey FOREIGN KEY (sector_id, club_id) REFERENCES miclub.sectors(id, club_id) ON DELETE RESTRICT;


--
-- Name: CONSTRAINT activities_sector_tenant_fkey ON activities; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON CONSTRAINT activities_sector_tenant_fkey ON miclub.activities IS 'Tenant-scoped sector reference. Referenced sectors must be archived instead of deleted.';


--
-- Name: activities activities_settlement_category_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_settlement_category_fkey FOREIGN KEY (settlement_category_id) REFERENCES miclub.movement_categories(id) NOT VALID;


--
-- Name: activities activities_updated_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activities
    ADD CONSTRAINT activities_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES miclub.people(id) NOT VALID;


--
-- Name: activity_fee_cleanup_candidates activity_fee_cleanup_candidates_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_cleanup_candidates
    ADD CONSTRAINT activity_fee_cleanup_candidates_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id) ON DELETE CASCADE;


--
-- Name: activity_fee_cleanup_candidates activity_fee_cleanup_candidates_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_cleanup_candidates
    ADD CONSTRAINT activity_fee_cleanup_candidates_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: activity_fee_history activity_fee_history_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_history
    ADD CONSTRAINT activity_fee_history_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id) ON DELETE CASCADE;


--
-- Name: activity_fee_history activity_fee_history_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_history
    ADD CONSTRAINT activity_fee_history_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: activity_fee_history activity_fee_history_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_fee_history
    ADD CONSTRAINT activity_fee_history_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES miclub.import_batches(id);


--
-- Name: activity_icon_aliases activity_icon_aliases_icon_key_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_icon_aliases
    ADD CONSTRAINT activity_icon_aliases_icon_key_fkey FOREIGN KEY (icon_key) REFERENCES miclub.activity_icon_catalog(icon_key);


--
-- Name: activity_schedules activity_schedules_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_schedules
    ADD CONSTRAINT activity_schedules_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id) ON DELETE CASCADE;


--
-- Name: activity_settlement_allocations activity_settlement_allocations_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlement_allocations
    ADD CONSTRAINT activity_settlement_allocations_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: activity_settlement_allocations activity_settlement_allocations_movement_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlement_allocations
    ADD CONSTRAINT activity_settlement_allocations_movement_tenant_fkey FOREIGN KEY (movement_id, club_id) REFERENCES miclub.movements(id, club_id) ON DELETE RESTRICT;


--
-- Name: activity_settlement_allocations activity_settlement_allocations_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlement_allocations
    ADD CONSTRAINT activity_settlement_allocations_tenant_fkey FOREIGN KEY (settlement_id, club_id) REFERENCES miclub.activity_settlements(id, club_id);


--
-- Name: activity_settlements activity_settlements_activity_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlements
    ADD CONSTRAINT activity_settlements_activity_tenant_fkey FOREIGN KEY (activity_id, club_id) REFERENCES miclub.activities(id, club_id);


--
-- Name: activity_settlements activity_settlements_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlements
    ADD CONSTRAINT activity_settlements_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: activity_settlements activity_settlements_term_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_settlements
    ADD CONSTRAINT activity_settlements_term_tenant_fkey FOREIGN KEY (activity_term_id, activity_id, club_id) REFERENCES miclub.activity_terms(id, activity_id, club_id);


--
-- Name: activity_terms activity_terms_activity_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_activity_tenant_fkey FOREIGN KEY (activity_id, club_id) REFERENCES miclub.activities(id, club_id);


--
-- Name: activity_terms activity_terms_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: activity_terms activity_terms_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.users(id);


--
-- Name: activity_terms activity_terms_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code);


--
-- Name: activity_terms_migration_diagnostic activity_terms_migration_diagnostic_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms_migration_diagnostic
    ADD CONSTRAINT activity_terms_migration_diagnostic_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id);


--
-- Name: activity_terms activity_terms_updated_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.activity_terms
    ADD CONSTRAINT activity_terms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES miclub.users(id);


--
-- Name: app_sessions app_sessions_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.app_sessions
    ADD CONSTRAINT app_sessions_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE CASCADE;


--
-- Name: app_sessions app_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.app_sessions
    ADD CONSTRAINT app_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES miclub.users(id) ON DELETE CASCADE;


--
-- Name: users app_users_role_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.users
    ADD CONSTRAINT app_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES miclub.roles(id);


--
-- Name: approval_requests approval_requests_assigned_to_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_assigned_to_membership_id_fkey FOREIGN KEY (assigned_to_membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_decided_by_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_decided_by_membership_id_fkey FOREIGN KEY (decided_by_membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_requested_by_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_requested_by_membership_id_fkey FOREIGN KEY (requested_by_membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.approval_requests
    ADD CONSTRAINT approval_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.audit_log
    ADD CONSTRAINT audit_log_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.audit_log
    ADD CONSTRAINT audit_log_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES miclub.users(id);


--
-- Name: billing_payment_confirmations billing_payment_confirmations_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.billing_payment_confirmations
    ADD CONSTRAINT billing_payment_confirmations_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: billing_payment_confirmations billing_payment_confirmations_subscription_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.billing_payment_confirmations
    ADD CONSTRAINT billing_payment_confirmations_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES miclub.club_subscriptions(id);


--
-- Name: category_import_aliases category_import_aliases_catalog_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.category_import_aliases
    ADD CONSTRAINT category_import_aliases_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES miclub.category_catalog(id) ON DELETE RESTRICT;


--
-- Name: club_capabilities club_capabilities_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_capabilities
    ADD CONSTRAINT club_capabilities_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: club_memberships club_memberships_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_memberships
    ADD CONSTRAINT club_memberships_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: club_memberships club_memberships_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_memberships
    ADD CONSTRAINT club_memberships_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id) ON DELETE CASCADE;


--
-- Name: club_onboarding club_onboarding_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_onboarding
    ADD CONSTRAINT club_onboarding_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: club_subscriptions club_subscriptions_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_subscriptions
    ADD CONSTRAINT club_subscriptions_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: club_subscriptions club_subscriptions_plan_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.club_subscriptions
    ADD CONSTRAINT club_subscriptions_plan_code_fkey FOREIGN KEY (plan_code) REFERENCES miclub.plans(code);


--
-- Name: clubs clubs_base_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.clubs
    ADD CONSTRAINT clubs_base_currency_code_fkey FOREIGN KEY (base_currency_code) REFERENCES miclub.currencies(code);


--
-- Name: crm_message_history crm_message_history_club_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_message_history_club_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: crm_message_history crm_message_history_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_message_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.users(id);


--
-- Name: crm_message_history crm_message_history_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_message_history_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES miclub.enrollments(id);


--
-- Name: crm_message_history crm_message_history_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_message_history_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id);


--
-- Name: crm_message_history crm_message_history_template_club_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_history
    ADD CONSTRAINT crm_message_history_template_club_fkey FOREIGN KEY (club_id, template_id) REFERENCES miclub.crm_message_templates(club_id, id);


--
-- Name: crm_message_templates crm_message_templates_archived_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_templates
    ADD CONSTRAINT crm_message_templates_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: crm_message_templates crm_message_templates_club_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_templates
    ADD CONSTRAINT crm_message_templates_club_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: crm_message_templates crm_message_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.crm_message_templates
    ADD CONSTRAINT crm_message_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.users(id);


--
-- Name: discount_rates discount_rates_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.discount_rates
    ADD CONSTRAINT discount_rates_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: employee_photos employee_photos_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employee_photos
    ADD CONSTRAINT employee_photos_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: employee_photos employee_photos_employee_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employee_photos
    ADD CONSTRAINT employee_photos_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES miclub.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: employees employees_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: employees employees_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code);


--
-- Name: employees employees_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: employees employees_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id) ON DELETE RESTRICT;


--
-- Name: employees employees_sector_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES miclub.sectors(id) ON DELETE SET NULL;


--
-- Name: employees employees_updated_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: enrollment_fee_audit enrollment_fee_audit_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollment_fee_audit
    ADD CONSTRAINT enrollment_fee_audit_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: enrollment_fee_audit enrollment_fee_audit_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollment_fee_audit
    ADD CONSTRAINT enrollment_fee_audit_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES miclub.enrollments(id) ON DELETE CASCADE;


--
-- Name: enrollment_fee_audit enrollment_fee_audit_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollment_fee_audit
    ADD CONSTRAINT enrollment_fee_audit_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES miclub.import_batches(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollments
    ADD CONSTRAINT enrollments_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id);


--
-- Name: enrollments enrollments_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollments
    ADD CONSTRAINT enrollments_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: enrollments enrollments_missing_from_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollments
    ADD CONSTRAINT enrollments_missing_from_import_batch_id_fkey FOREIGN KEY (missing_from_import_batch_id) REFERENCES miclub.import_batches(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.enrollments
    ADD CONSTRAINT enrollments_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id);


--
-- Name: exchange_rate_usage_components exchange_rate_usage_components_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usage_components
    ADD CONSTRAINT exchange_rate_usage_components_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES miclub.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: exchange_rate_usage_components exchange_rate_usage_components_exchange_rate_usage_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usage_components
    ADD CONSTRAINT exchange_rate_usage_components_exchange_rate_usage_id_fkey FOREIGN KEY (exchange_rate_usage_id) REFERENCES miclub.exchange_rate_usages(id) ON DELETE RESTRICT;


--
-- Name: exchange_rate_usages exchange_rate_usages_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usages
    ADD CONSTRAINT exchange_rate_usages_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE RESTRICT;


--
-- Name: exchange_rate_usages exchange_rate_usages_exchange_rate_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rate_usages
    ADD CONSTRAINT exchange_rate_usages_exchange_rate_id_fkey FOREIGN KEY (exchange_rate_id) REFERENCES miclub.exchange_rates(id) ON DELETE RESTRICT;


--
-- Name: exchange_rates exchange_rates_base_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rates
    ADD CONSTRAINT exchange_rates_base_currency_code_fkey FOREIGN KEY (base_currency_code) REFERENCES miclub.currencies(code);


--
-- Name: exchange_rates exchange_rates_quote_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.exchange_rates
    ADD CONSTRAINT exchange_rates_quote_currency_code_fkey FOREIGN KEY (quote_currency_code) REFERENCES miclub.currencies(code);


--
-- Name: financial_accounts financial_accounts_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.financial_accounts
    ADD CONSTRAINT financial_accounts_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: financial_accounts financial_accounts_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.financial_accounts
    ADD CONSTRAINT financial_accounts_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code);


--
-- Name: import_batches import_batches_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_batches
    ADD CONSTRAINT import_batches_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: import_batches import_batches_dry_run_of_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_batches
    ADD CONSTRAINT import_batches_dry_run_of_batch_id_fkey FOREIGN KEY (dry_run_of_batch_id) REFERENCES miclub.import_batches(id);


--
-- Name: import_batches import_batches_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_batches
    ADD CONSTRAINT import_batches_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: import_errors import_errors_batch_club_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_errors
    ADD CONSTRAINT import_errors_batch_club_fkey FOREIGN KEY (batch_id, club_id) REFERENCES miclub.import_batches(id, club_id) ON DELETE CASCADE;


--
-- Name: CONSTRAINT import_errors_batch_club_fkey ON import_errors; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON CONSTRAINT import_errors_batch_club_fkey ON miclub.import_errors IS 'Impide relacionar errores y lotes de importación de clubes distintos.';


--
-- Name: import_errors import_errors_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.import_errors
    ADD CONSTRAINT import_errors_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: instructors instructors_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.instructors
    ADD CONSTRAINT instructors_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: instructors instructors_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.instructors
    ADD CONSTRAINT instructors_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id) ON DELETE CASCADE;


--
-- Name: movement_categories movement_categories_catalog_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movement_categories
    ADD CONSTRAINT movement_categories_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES miclub.category_catalog(id);


--
-- Name: movement_categories movement_categories_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movement_categories
    ADD CONSTRAINT movement_categories_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: movements movements_account_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_account_id_fkey FOREIGN KEY (account_id) REFERENCES miclub.financial_accounts(id);


--
-- Name: movements movements_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id);


--
-- Name: movements movements_category_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_category_id_fkey FOREIGN KEY (category_id) REFERENCES miclub.movement_categories(id);


--
-- Name: movements movements_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: movements movements_counterparty_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_counterparty_person_id_fkey FOREIGN KEY (counterparty_person_id) REFERENCES miclub.people(id);


--
-- Name: movements movements_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.users(id);


--
-- Name: movements movements_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code);


--
-- Name: movements movements_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES miclub.payment_methods(id);


--
-- Name: movements movements_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id);


--
-- Name: movements movements_sector_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES miclub.sectors(id);


--
-- Name: movements movements_voided_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.movements
    ADD CONSTRAINT movements_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES miclub.users(id);


--
-- Name: onboarding_operations onboarding_operations_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.onboarding_operations
    ADD CONSTRAINT onboarding_operations_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: onboarding_operations onboarding_operations_created_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.onboarding_operations
    ADD CONSTRAINT onboarding_operations_created_by_fkey FOREIGN KEY (created_by) REFERENCES miclub.users(id);


--
-- Name: opening_balance_batches opening_balance_batches_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_batches
    ADD CONSTRAINT opening_balance_batches_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: opening_balance_batches opening_balance_batches_operational_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_batches
    ADD CONSTRAINT opening_balance_batches_operational_currency_code_fkey FOREIGN KEY (operational_currency_code) REFERENCES miclub.currencies(code);


--
-- Name: opening_balance_batches opening_balance_batches_replaces_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_batches
    ADD CONSTRAINT opening_balance_batches_replaces_batch_id_fkey FOREIGN KEY (replaces_batch_id) REFERENCES miclub.opening_balance_batches(id);


--
-- Name: opening_balance_movements opening_balance_movements_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_movements
    ADD CONSTRAINT opening_balance_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES miclub.opening_balance_batches(id);


--
-- Name: opening_balance_movements opening_balance_movements_movement_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_movements
    ADD CONSTRAINT opening_balance_movements_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES miclub.movements(id);


--
-- Name: opening_balance_movements opening_balance_movements_reverses_movement_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.opening_balance_movements
    ADD CONSTRAINT opening_balance_movements_reverses_movement_id_fkey FOREIGN KEY (reverses_movement_id) REFERENCES miclub.movements(id);


--
-- Name: operational_balances operational_balances_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.operational_balances
    ADD CONSTRAINT operational_balances_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: operational_balances operational_balances_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.operational_balances
    ADD CONSTRAINT operational_balances_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code);


--
-- Name: operational_balances operational_balances_sector_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.operational_balances
    ADD CONSTRAINT operational_balances_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES miclub.sectors(id);


--
-- Name: payment_allocations payment_allocations_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payment_allocations
    ADD CONSTRAINT payment_allocations_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: payment_allocations payment_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payment_allocations
    ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES miclub.payments(id) ON DELETE CASCADE;


--
-- Name: payment_allocations payment_allocations_receivable_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payment_allocations
    ADD CONSTRAINT payment_allocations_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES miclub.receivables(id);


--
-- Name: payment_methods payment_methods_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payment_methods
    ADD CONSTRAINT payment_methods_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: payments payments_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payments
    ADD CONSTRAINT payments_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: payments payments_currency_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payments
    ADD CONSTRAINT payments_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES miclub.currencies(code);


--
-- Name: payments payments_movement_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payments
    ADD CONSTRAINT payments_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES miclub.movements(id);


--
-- Name: payments payments_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payments
    ADD CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES miclub.payment_methods(id);


--
-- Name: payments payments_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.payments
    ADD CONSTRAINT payments_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id);


--
-- Name: people people_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.people
    ADD CONSTRAINT people_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: people people_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.people
    ADD CONSTRAINT people_user_id_fkey FOREIGN KEY (user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: person_kind_links person_kind_links_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.person_kind_links
    ADD CONSTRAINT person_kind_links_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: person_kind_links person_kind_links_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.person_kind_links
    ADD CONSTRAINT person_kind_links_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id) ON DELETE CASCADE;


--
-- Name: plan_entitlements plan_entitlements_feature_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.plan_entitlements
    ADD CONSTRAINT plan_entitlements_feature_code_fkey FOREIGN KEY (feature_code) REFERENCES miclub.features(code) ON DELETE CASCADE;


--
-- Name: plan_entitlements plan_entitlements_plan_code_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.plan_entitlements
    ADD CONSTRAINT plan_entitlements_plan_code_fkey FOREIGN KEY (plan_code) REFERENCES miclub.plans(code) ON DELETE CASCADE;


--
-- Name: receivables receivables_activity_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.receivables
    ADD CONSTRAINT receivables_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES miclub.activities(id);


--
-- Name: receivables receivables_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.receivables
    ADD CONSTRAINT receivables_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: receivables receivables_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.receivables
    ADD CONSTRAINT receivables_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES miclub.enrollments(id);


--
-- Name: receivables receivables_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.receivables
    ADD CONSTRAINT receivables_person_id_fkey FOREIGN KEY (person_id) REFERENCES miclub.people(id);


--
-- Name: receivables receivables_sector_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.receivables
    ADD CONSTRAINT receivables_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES miclub.sectors(id);


--
-- Name: roles roles_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.roles
    ADD CONSTRAINT roles_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: salon_hour_prices salon_hour_prices_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.salon_hour_prices
    ADD CONSTRAINT salon_hour_prices_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: sector_settlements sector_settlements_responsible_person_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sector_settlements
    ADD CONSTRAINT sector_settlements_responsible_person_id_fkey FOREIGN KEY (responsible_person_id) REFERENCES miclub.people(id);


--
-- Name: sector_settlements sector_settlements_sector_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sector_settlements
    ADD CONSTRAINT sector_settlements_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES miclub.sectors(id);


--
-- Name: sectors sectors_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: sectors sectors_created_by_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_created_by_tenant_fkey FOREIGN KEY (created_by, club_id) REFERENCES miclub.user_club_memberships(user_id, club_id) ON DELETE RESTRICT;


--
-- Name: sectors sectors_manager_person_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_manager_person_tenant_fkey FOREIGN KEY (manager_person_id, club_id) REFERENCES miclub.people(id, club_id) ON DELETE RESTRICT;


--
-- Name: sectors sectors_template_fk; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_template_fk FOREIGN KEY (template_id) REFERENCES miclub.sector_templates(id);


--
-- Name: sectors sectors_updated_by_tenant_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sectors
    ADD CONSTRAINT sectors_updated_by_tenant_fkey FOREIGN KEY (updated_by, club_id) REFERENCES miclub.user_club_memberships(user_id, club_id) ON DELETE RESTRICT;


--
-- Name: sheet_metric_snapshots sheet_metric_snapshots_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.sheet_metric_snapshots
    ADD CONSTRAINT sheet_metric_snapshots_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id);


--
-- Name: tasks tasks_assigned_to_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tasks
    ADD CONSTRAINT tasks_assigned_to_membership_id_fkey FOREIGN KEY (assigned_to_membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tasks
    ADD CONSTRAINT tasks_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tasks
    ADD CONSTRAINT tasks_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tasks
    ADD CONSTRAINT tasks_created_by_membership_id_fkey FOREIGN KEY (created_by_membership_id) REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES miclub.users(id) ON DELETE SET NULL;


--
-- Name: tenant_sequences tenant_sequences_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.tenant_sequences
    ADD CONSTRAINT tenant_sequences_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: user_club_memberships user_club_memberships_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.user_club_memberships
    ADD CONSTRAINT user_club_memberships_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: user_club_memberships user_club_memberships_role_club_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.user_club_memberships
    ADD CONSTRAINT user_club_memberships_role_club_fkey FOREIGN KEY (role_id, club_id) REFERENCES miclub.roles(id, club_id);


--
-- Name: CONSTRAINT user_club_memberships_role_club_fkey ON user_club_memberships; Type: COMMENT; Schema: miclub; Owner: -
--

COMMENT ON CONSTRAINT user_club_memberships_role_club_fkey ON miclub.user_club_memberships IS 'Garantiza que el rol y la membresía pertenecen al mismo tenant.';


--
-- Name: user_club_memberships user_club_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.user_club_memberships
    ADD CONSTRAINT user_club_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES miclub.users(id) ON DELETE CASCADE;


--
-- Name: worker_invitations worker_invitations_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: worker_invitations worker_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES miclub.users(id);


--
-- Name: worker_invitations worker_invitations_membership_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES miclub.user_club_memberships(id);


--
-- Name: worker_invitations worker_invitations_role_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES miclub.roles(id);


--
-- Name: worker_invitations worker_invitations_user_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.worker_invitations
    ADD CONSTRAINT worker_invitations_user_id_fkey FOREIGN KEY (user_id) REFERENCES miclub.users(id) ON DELETE CASCADE;


--
-- Name: xlsx_import_rows xlsx_import_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.xlsx_import_rows
    ADD CONSTRAINT xlsx_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES miclub.import_batches(id) ON DELETE CASCADE;


--
-- Name: xlsx_import_rows xlsx_import_rows_club_id_fkey; Type: FK CONSTRAINT; Schema: miclub; Owner: -
--

ALTER TABLE ONLY miclub.xlsx_import_rows
    ADD CONSTRAINT xlsx_import_rows_club_id_fkey FOREIGN KEY (club_id) REFERENCES miclub.clubs(id) ON DELETE CASCADE;


--
-- Name: activities; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_fee_cleanup_candidates; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.activity_fee_cleanup_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_fee_history; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.activity_fee_history ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_payment_confirmations; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.billing_payment_confirmations ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_payment_confirmations billing_payment_confirmations_tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY billing_payment_confirmations_tenant_isolation ON miclub.billing_payment_confirmations USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: club_memberships; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.club_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_message_history; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.crm_message_history ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_message_templates; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.crm_message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: discount_rates; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.discount_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_photos; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.employee_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_photos employee_photos_tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY employee_photos_tenant_isolation ON miclub.employee_photos USING ((club_id = (NULLIF(current_setting('app.current_club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.current_club_id'::text, true), ''::text))::uuid));


--
-- Name: enrollment_fee_audit; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.enrollment_fee_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_accounts; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.financial_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: import_batches; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: import_errors; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.import_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: instructors; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.instructors ENABLE ROW LEVEL SECURITY;

--
-- Name: movement_categories; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.movement_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: movements; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.movements ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_operations; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.onboarding_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_operations onboarding_operations_tenant; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY onboarding_operations_tenant ON miclub.onboarding_operations USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: opening_balance_batches; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.opening_balance_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: opening_balance_movements; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.opening_balance_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_balances; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.operational_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_allocations; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.payment_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: people; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.people ENABLE ROW LEVEL SECURITY;

--
-- Name: person_kind_links; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.person_kind_links ENABLE ROW LEVEL SECURITY;

--
-- Name: receivables; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.receivables ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: salon_hour_prices; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.salon_hour_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: sectors; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.sectors ENABLE ROW LEVEL SECURITY;

--
-- Name: sheet_metric_snapshots; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.sheet_metric_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: activities tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.activities TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: activity_fee_cleanup_candidates tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.activity_fee_cleanup_candidates USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: activity_fee_history tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.activity_fee_history USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: audit_log tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.audit_log USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: club_memberships tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.club_memberships TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: crm_message_history tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.crm_message_history TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: crm_message_templates tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.crm_message_templates TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: discount_rates tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.discount_rates USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: enrollment_fee_audit tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.enrollment_fee_audit USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: enrollments tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.enrollments TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: financial_accounts tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.financial_accounts USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: import_batches tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.import_batches TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: import_errors tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.import_errors TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: instructors tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.instructors USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: movement_categories tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.movement_categories USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: movements tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.movements TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: opening_balance_batches tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.opening_balance_batches USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: opening_balance_movements tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.opening_balance_movements USING ((EXISTS ( SELECT 1
   FROM miclub.opening_balance_batches b
  WHERE ((b.id = opening_balance_movements.batch_id) AND (b.club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)))));


--
-- Name: operational_balances tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.operational_balances USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: payment_allocations tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.payment_allocations USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: payment_methods tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.payment_methods USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: payments tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.payments USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: people tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.people TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: person_kind_links tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.person_kind_links USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: receivables tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.receivables USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: roles tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.roles USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: salon_hour_prices tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.salon_hour_prices USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: sectors tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.sectors USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: sheet_metric_snapshots tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.sheet_metric_snapshots USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: user_club_memberships tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.user_club_memberships TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: xlsx_import_rows tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY tenant_isolation ON miclub.xlsx_import_rows TO miclub_runtime USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- Name: user_club_memberships; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.user_club_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: xlsx_import_rows; Type: ROW SECURITY; Schema: miclub; Owner: -
--

ALTER TABLE miclub.xlsx_import_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: xlsx_import_rows xlsx_import_rows_tenant_isolation; Type: POLICY; Schema: miclub; Owner: -
--

CREATE POLICY xlsx_import_rows_tenant_isolation ON miclub.xlsx_import_rows USING ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid)) WITH CHECK ((club_id = (NULLIF(current_setting('app.club_id'::text, true), ''::text))::uuid));


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: currencies; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.currencies (code, name, symbol) VALUES ('ARS', 'Peso argentino', '$');
INSERT INTO miclub.currencies (code, name, symbol) VALUES ('USD', 'Dólar estadounidense', 'US$');
INSERT INTO miclub.currencies (code, name, symbol) VALUES ('BRL', 'Real brasileño', 'R$');
INSERT INTO miclub.currencies (code, name, symbol) VALUES ('EUR', 'Euro', '€');


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: category_catalog; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('74c3818c-8bcc-4024-8ca0-fc876efb1d0c', 'INSCRIPCION', 'Inscripción', 'OPERATIONAL', true, 10, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('60c8dd17-42be-431d-873c-b6df720a5e87', 'CUOTA', 'Cuota', 'OPERATIONAL', true, 20, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('4804740c-3a0b-44de-abb6-f221e0e30b21', 'TURNOS', 'Turnos', 'OPERATIONAL', true, 30, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('94186dbb-b42b-48ec-9291-94e6588c5e46', 'COMISION', 'Comisión', 'OPERATIONAL', true, 40, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('87dbb038-bf0a-455e-a77b-ea039bdb9a19', 'ALQUILER', 'Alquiler', 'OPERATIONAL', true, 50, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('6f71d635-cfdf-460d-888a-3b3e8b4524e7', 'EVENTOS', 'Eventos', 'OPERATIONAL', true, 60, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('eefe0c5c-b7c9-4312-bda6-773a2b59f2a7', 'VENTAS', 'Ventas', 'OPERATIONAL', true, 70, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('20f91bfe-d323-4efa-9a64-84231a0c7f79', 'CLASES', 'Clases', 'OPERATIONAL', true, 80, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('90bebc8e-dc45-4a2a-af39-0b46608ea566', 'CURSOS', 'Cursos', 'OPERATIONAL', true, 90, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('0bb7489b-c975-4a0a-94a8-ff60e2cff330', 'KIOSCO', 'Kiosco', 'OPERATIONAL', true, 100, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('329ef36c-1adc-4747-8e82-46a20585dace', 'BEBIDAS', 'Bebidas', 'OPERATIONAL', true, 110, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('e7be4c80-d5ca-48b6-8aa1-27b57801f00b', 'PUBLICIDAD', 'Publicidad', 'NON_OPERATIONAL', true, 120, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('d905e982-8751-406c-af17-bd1c9cd0e0e8', 'MANTENIMIENTO', 'Mantenimiento', 'NON_OPERATIONAL', true, 140, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('d9946408-6eb9-4ec9-91f2-4acd23a8b372', 'DEPOSITOS', 'Depósitos', 'NON_OPERATIONAL', true, 150, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('daac926e-ad66-4cee-8581-b8fc1128d8a8', 'EXTRACCIONES', 'Extracciones', 'NON_OPERATIONAL', true, 160, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('1f2ed149-8d73-43fb-bd0a-4d8988bc49da', 'DOLARES', 'Dólares', 'NON_OPERATIONAL', true, 170, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('82bad2ad-94fd-4e39-b72f-0831a57c7312', 'REPARACIONES', 'Reparaciones', 'NON_OPERATIONAL', true, 180, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('8b15f290-09d1-4405-b022-beb0846c94cb', 'SALARIOS', 'Salarios', 'OPERATIONAL', true, 130, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('93aa9bdf-ec31-4c79-aac9-d6a7029183aa', 'VIATICOS', 'Viáticos', 'NON_OPERATIONAL', true, 190, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('073098ec-f8af-4f1e-baef-4a08542a12b4', 'GANANCIA', 'Ganancia', 'NON_OPERATIONAL', true, 200, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('4e1ec33a-0387-4087-aaae-bb371b40c30b', 'PERDIDA', 'Pérdida', 'NON_OPERATIONAL', true, 210, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('cb27b570-93e5-4b40-82aa-436aa59521a4', 'SEGUROS', 'Seguros', 'NON_OPERATIONAL', true, 230, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('760cd19f-92ee-4025-bd3a-7a698321aeb0', 'LIMPIEZA', 'Limpieza', 'NON_OPERATIONAL', true, 240, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('3285e0ae-0ad6-4670-bc36-8d1d8a09a3f2', 'LIBRERIA', 'Librería', 'NON_OPERATIONAL', true, 250, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('35d61567-254f-4844-8c3f-0d40f405080d', 'OTROS', 'Otros', 'NON_OPERATIONAL', true, 260, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('f1955180-e137-4711-95b5-1fca99ae4e2e', 'IMPUESTOS', 'Impuestos', 'TAX', true, 270, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('29381e18-b120-471f-96eb-3d46d3645125', 'LUZ', 'Luz', 'SERVICE', true, 280, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('81ef1a75-f83d-45ee-bc7e-b338bd5b08ca', 'AGUA', 'Agua', 'SERVICE', true, 290, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('0670a296-cc09-42c2-9b20-02932538d0a0', 'INTERNET', 'Internet', 'SERVICE', true, 300, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('581d3781-0c98-48e1-83e1-1a5eaf60197d', 'DEUDAS', 'Deudas', 'LIABILITY', true, 310, '2026-08-12 23:31:13.137772-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('05524a24-d064-4fc9-8a81-0aa6ff78a4fe', 'SERVICIOS', 'Servicios', 'SERVICE', true, 320, '2026-08-14 02:12:12.256228-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('6a5aca25-a67a-4ad6-9e0b-f7f159ef0c5b', 'CAPITAL_INICIAL', 'Capital inicial', 'NON_OPERATIONAL', true, 330, '2026-08-14 02:12:12.256228-03', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_catalog (id, code, display_name, classification, is_active, display_order, created_at, updated_at) VALUES ('10ce628c-036a-48df-a4ae-919813b3163c', 'CMV', 'CMV', 'NON_OPERATIONAL', true, 220, '2026-08-12 23:31:13.137772-03', '2026-09-08 00:43:22.774685-03');


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: category_import_aliases; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('PÉRDIDA', '4e1ec33a-0387-4087-aaae-bb371b40c30b', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('IMPUESTOS', 'f1955180-e137-4711-95b5-1fca99ae4e2e', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('DOLARES', '1f2ed149-8d73-43fb-bd0a-4d8988bc49da', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('VENTAS', 'eefe0c5c-b7c9-4312-bda6-773a2b59f2a7', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CAPITAL_INICIAL', '6a5aca25-a67a-4ad6-9e0b-f7f159ef0c5b', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('VIÁTICOS', '93aa9bdf-ec31-4c79-aac9-d6a7029183aa', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CAPITAL INICIAL', '6a5aca25-a67a-4ad6-9e0b-f7f159ef0c5b', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('SEGUROS', 'cb27b570-93e5-4b40-82aa-436aa59521a4', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CLASES', '20f91bfe-d323-4efa-9a64-84231a0c7f79', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('PERDIDA', '4e1ec33a-0387-4087-aaae-bb371b40c30b', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('DÓLARES', '1f2ed149-8d73-43fb-bd0a-4d8988bc49da', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('REPARACIONES', '82bad2ad-94fd-4e39-b72f-0831a57c7312', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('VIATICOS', '93aa9bdf-ec31-4c79-aac9-d6a7029183aa', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('OTROS', '35d61567-254f-4844-8c3f-0d40f405080d', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('SALARIOS', '8b15f290-09d1-4405-b022-beb0846c94cb', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('DEUDAS', '581d3781-0c98-48e1-83e1-1a5eaf60197d', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('LIMPIEZA', '760cd19f-92ee-4025-bd3a-7a698321aeb0', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CURSOS', '90bebc8e-dc45-4a2a-af39-0b46608ea566', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('INTERNET', '0670a296-cc09-42c2-9b20-02932538d0a0', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('DEPÓSITOS', 'd9946408-6eb9-4ec9-91f2-4acd23a8b372', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('BEBIDAS', '329ef36c-1adc-4747-8e82-46a20585dace', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('ALQUILER', '87dbb038-bf0a-455e-a77b-ea039bdb9a19', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('LUZ', '29381e18-b120-471f-96eb-3d46d3645125', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('TURNOS', '4804740c-3a0b-44de-abb6-f221e0e30b21', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('INSCRIPCIÓN', '74c3818c-8bcc-4024-8ca0-fc876efb1d0c', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('LIBRERIA', '3285e0ae-0ad6-4670-bc36-8d1d8a09a3f2', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('LIBRERÍA', '3285e0ae-0ad6-4670-bc36-8d1d8a09a3f2', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('EVENTOS', '6f71d635-cfdf-460d-888a-3b3e8b4524e7', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('EXTRACCIONES', 'daac926e-ad66-4cee-8581-b8fc1128d8a8', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('KIOSCO', '0bb7489b-c975-4a0a-94a8-ff60e2cff330', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('INSCRIPCION', '74c3818c-8bcc-4024-8ca0-fc876efb1d0c', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('PUBLICIDAD', 'e7be4c80-d5ca-48b6-8aa1-27b57801f00b', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('COMISIÓN', '94186dbb-b42b-48ec-9291-94e6588c5e46', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('GANANCIA', '073098ec-f8af-4f1e-baef-4a08542a12b4', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('DEPOSITOS', 'd9946408-6eb9-4ec9-91f2-4acd23a8b372', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('SERVICIOS', '05524a24-d064-4fc9-8a81-0aa6ff78a4fe', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('AGUA', '81ef1a75-f83d-45ee-bc7e-b338bd5b08ca', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('MANTENIMIENTO', 'd905e982-8751-406c-af17-bd1c9cd0e0e8', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('COMISION', '94186dbb-b42b-48ec-9291-94e6588c5e46', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CUOTA', '60c8dd17-42be-431d-873c-b6df720a5e87', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('MANTENIM.', 'd905e982-8751-406c-af17-bd1c9cd0e0e8', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('MANTENIM', 'd905e982-8751-406c-af17-bd1c9cd0e0e8', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('SALARIO', '8b15f290-09d1-4405-b022-beb0846c94cb', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('SUELDOS', '8b15f290-09d1-4405-b022-beb0846c94cb', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('IMPUESTO', 'f1955180-e137-4711-95b5-1fca99ae4e2e', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('DEUDA', '581d3781-0c98-48e1-83e1-1a5eaf60197d', '2026-08-14 02:12:12.256228-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CAPITAL', '6a5aca25-a67a-4ad6-9e0b-f7f159ef0c5b', '2026-08-21 16:30:30.191749-03');
INSERT INTO miclub.category_import_aliases (normalized_alias, catalog_id, created_at) VALUES ('CMV', '10ce628c-036a-48df-a4ae-919813b3163c', '2026-08-21 16:30:30.191749-03');


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: sector_templates; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('bda69b39-72d1-428b-ba43-4ad7eb565633', 'futbol', 'Fútbol', 'sports_soccer', true, 10);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('79d9766b-369e-456d-902d-0e9889100025', 'futsal', 'Futsal', 'sports_soccer', true, 20);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('649b0c02-7ff5-4cdf-b9c0-41cc4dbc86d4', 'basquet', 'Básquet', 'sports_basketball', true, 30);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('08e2778e-f6f1-429f-be81-dd1ec3a0c7cb', 'voley', 'Vóley', 'sports_volleyball', true, 40);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('b968f0f1-7b44-4080-98a6-6dc495a545a1', 'handball', 'Handball', 'sports_handball', true, 50);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('673f8096-1ba5-41e1-9c57-f97404bd6000', 'hockey', 'Hockey', 'sports_hockey', true, 60);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('10a8af96-6b1b-4310-801a-dc433a3f5e1f', 'tenis', 'Tenis', 'sports_tennis', true, 70);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('07ede331-02e0-428d-9a72-738ede36edc4', 'padel', 'Pádel', 'sports_tennis', true, 80);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('e6019976-038c-47d9-8d45-7e96945d826f', 'natacion', 'Natación', 'pool', true, 90);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('f8a08579-d77e-4a8c-a217-22d4e4bc610e', 'gimnasio', 'Gimnasio', 'fitness_center', true, 100);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('ab4c690b-2c62-4068-893f-603572dd7356', 'fitness', 'Fitness', 'exercise', true, 110);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('d1bcd983-e0ea-475c-a35a-5b6b1ba34952', 'artes-marciales', 'Artes Marciales', 'sports_martial_arts', true, 120);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('c9dc0ea3-fa43-48ae-aa8f-860cbb533419', 'patin', 'Patín', 'roller_skating', true, 130);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('a4dd2a59-17b1-42e7-bac2-75df39defa83', 'gimnasia-artistica', 'Gimnasia Artística', 'sports_gymnastics', true, 140);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('d7c8a97f-4c41-4b4d-9e4d-8698e9aa8a20', 'atletismo', 'Atletismo', 'sprint', true, 150);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('47a2483a-ffd6-4cb0-9592-d0ff29bc0bea', 'rugby', 'Rugby', 'sports_rugby', true, 160);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('a7a08d18-58be-4850-bd8e-cf48afbd5b1d', 'bochas', 'Bochas', 'sports', true, 170);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('5ada5755-473c-40e5-8543-3b4271cd36f5', 'pelota-paleta', 'Pelota Paleta', 'sports_tennis', true, 180);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('6f7e8680-324f-47c5-b8cc-609a161d61a6', 'salon', 'Salón', 'meeting_room', true, 190);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('91f478a4-040b-4a17-9232-6ce8cfc5473d', 'aula', 'Aula', 'school', true, 200);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('801165a7-52ae-414a-8e8b-ea28be04ae82', 'biblioteca', 'Biblioteca', 'local_library', true, 210);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('5cca728c-232d-4a24-a2ba-c754491ab6b6', 'cultura', 'Cultura', 'theater_comedy', true, 220);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('ff89c1ee-41f1-4bf7-a87d-f604c9fb43ac', 'cantina', 'Cantina', 'restaurant', true, 230);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('beeb2281-2405-4e3d-b89b-042d5a6786e9', 'quincho', 'Quincho', 'outdoor_grill', true, 240);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('2342cb2d-e548-4449-b599-a86cd6f8d9b5', 'pileta', 'Pileta recreativa', 'pool', true, 250);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('daf96e09-67d3-4195-a39c-39999e81d4f7', 'camping', 'Camping', 'camping', true, 260);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('295bdffa-d704-498f-944c-161842fd8783', 'estacionamiento', 'Estacionamiento', 'local_parking', true, 270);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('9b0bfdca-4b9a-4af0-914a-3859ae6a1ee3', 'eventos', 'Eventos', 'celebration', true, 280);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('c1336c30-0e39-4262-bc1e-4af171c43726', 'alquileres', 'Alquileres', 'storefront', true, 290);
INSERT INTO miclub.sector_templates (id, code, display_name, icon_key, is_active, display_order) VALUES ('31a4a212-4043-4d47-a644-e24ae0a47c63', 'otros', 'Otros', 'category', true, 300);


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: activity_icon_catalog; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('football', 'Fútbol', 1, '2026-08-12 22:59:03.750696-03', '⚽', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('basketball', 'Básquet', 2, '2026-08-12 22:59:03.750696-03', '🏀', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('volleyball', 'Vóley', 3, '2026-08-12 22:59:03.750696-03', '🏐', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('rugby', 'Rugby', 4, '2026-08-12 22:59:03.750696-03', '🏉', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('tennis', 'Tenis', 5, '2026-08-12 22:59:03.750696-03', '🎾', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('table-tennis', 'Tenis de mesa', 6, '2026-08-27 23:45:26.183785-03', '🏓', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('badminton', 'Bádminton', 7, '2026-08-27 23:45:26.183785-03', '🏸', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('hockey', 'Hockey', 8, '2026-08-12 22:59:03.750696-03', '🏑', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('ice-hockey', 'Hockey sobre hielo', 9, '2026-08-27 23:45:26.183785-03', '🏒', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('boxing', 'Boxeo', 10, '2026-08-12 22:59:03.750696-03', '🥊', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('martial-arts', 'Artes marciales', 11, '2026-08-12 22:59:03.750696-03', '🥋', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('gymnastics', 'Gimnasia', 12, '2026-08-12 22:59:03.750696-03', '🤸', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('weights', 'Musculación', 13, '2026-08-12 22:59:03.750696-03', '🏋️', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('handball', 'Handball', 14, '2026-08-12 22:59:03.750696-03', '🤾', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('swimming', 'Natación', 15, '2026-08-12 22:59:03.750696-03', '🏊', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('water-polo', 'Waterpolo', 16, '2026-08-27 23:45:26.183785-03', '🤽', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('cycling', 'Ciclismo', 17, '2026-08-12 22:59:03.750696-03', '🚴', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('running', 'Running', 18, '2026-08-12 22:59:03.750696-03', '🏃', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('yoga', 'Yoga', 19, '2026-08-12 22:59:03.750696-03', '🧘', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('dance', 'Danza', 20, '2026-08-12 22:59:03.750696-03', '💃', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('skating', 'Patín', 21, '2026-08-12 22:59:03.750696-03', '⛸️', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('target', 'Tiro al blanco', 22, '2026-08-27 23:45:26.183785-03', '🎯', 'Juegos', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('chess', 'Ajedrez', 23, '2026-08-27 23:45:26.183785-03', '♟️', 'Juegos', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('archery', 'Arquería', 24, '2026-08-27 23:45:26.183785-03', '🏹', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('sales', 'Ventas', 25, '2026-08-27 23:45:26.183785-03', '🛍️', 'Comercio', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('gastronomy', 'Gastronomía', 26, '2026-08-27 23:45:26.183785-03', '🍽️', 'Comercio', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('services', 'Servicios', 27, '2026-08-27 23:45:26.183785-03', '🛠️', 'Servicios', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('health', 'Salud', 28, '2026-08-27 23:45:26.183785-03', '🩺', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('fitness', 'Fitness', 29, '2026-08-27 23:45:26.183785-03', '💪', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('meditation', 'Meditación', 30, '2026-08-27 23:45:26.183785-03', '🌿', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('music', 'Música', 31, '2026-08-27 23:45:26.183785-03', '🎵', 'Cultura', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('theater', 'Teatro', 32, '2026-08-27 23:45:26.183785-03', '🎭', 'Cultura', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('education', 'Educación', 33, '2026-08-27 23:45:26.183785-03', '📚', 'Cultura', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('children', 'Infancias', 34, '2026-08-27 23:45:26.183785-03', '🧒', 'Comunidad', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('social', 'Social', 35, '2026-08-27 23:45:26.183785-03', '🤝', 'Comunidad', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('other', 'Otra actividad', 36, '2026-08-12 22:59:03.750696-03', '✨', 'Otros', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('gym', 'Gimnasio', 1008, '2026-08-12 22:59:03.750696-03', NULL, NULL, false);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('baseball', 'Béisbol', 37, '2026-09-01 02:15:54.001585-03', '⚾', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('softball', 'Sóftbol', 38, '2026-09-01 02:15:54.001585-03', '🥎', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('golf', 'Golf', 39, '2026-09-01 02:15:54.001585-03', '⛳', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('cricket', 'Críquet', 40, '2026-09-01 02:15:54.001585-03', '🏏', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('surfing', 'Surf', 41, '2026-09-01 02:15:54.001585-03', '🏄', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('rowing', 'Remo', 42, '2026-09-01 02:15:54.001585-03', '🚣', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('climbing', 'Escalada', 43, '2026-09-01 02:15:54.001585-03', '🧗', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('skiing', 'Esquí', 44, '2026-09-01 02:15:54.001585-03', '⛷️', 'Deportes', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('pilates', 'Pilates', 45, '2026-08-12 22:59:03.750696-03', '🤸‍♀️', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('spa', 'Spa', 46, '2026-09-01 02:15:54.001585-03', '💆', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('nutrition', 'Nutrición', 47, '2026-09-01 02:15:54.001585-03', '🥗', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('therapy', 'Terapia', 48, '2026-09-01 02:15:54.001585-03', '🧠', 'Bienestar', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('store', 'Tienda', 49, '2026-09-01 02:15:54.001585-03', '🏪', 'Comercio', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('market', 'Mercado', 50, '2026-09-01 02:15:54.001585-03', '🛒', 'Comercio', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('cafeteria', 'Cafetería', 51, '2026-09-01 02:15:54.001585-03', '☕', 'Comercio', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('tickets', 'Entradas', 52, '2026-09-01 02:15:54.001585-03', '🎟️', 'Comercio', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('maintenance', 'Mantenimiento', 53, '2026-09-01 02:15:54.001585-03', '🔧', 'Servicios', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('transport', 'Transporte', 54, '2026-09-01 02:15:54.001585-03', '🚌', 'Servicios', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('childcare', 'Cuidado infantil', 55, '2026-09-01 02:15:54.001585-03', '🧸', 'Servicios', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('consulting', 'Consultoría', 56, '2026-09-01 02:15:54.001585-03', '💼', 'Servicios', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('painting', 'Pintura', 57, '2026-09-01 02:15:54.001585-03', '🎨', 'Cultura', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('photography', 'Fotografía', 58, '2026-09-01 02:15:54.001585-03', '📷', 'Cultura', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('cinema', 'Cine', 59, '2026-09-01 02:15:54.001585-03', '🎬', 'Cultura', true);
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, sort_order, created_at, glyph, category, active) VALUES ('writing', 'Escritura', 60, '2026-09-01 02:15:54.001585-03', '✍️', 'Cultura', true);


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: activity_icon_aliases; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.activity_icon_aliases (alias_key, icon_key, created_at) VALUES ('soccer', 'football', '2026-08-27 23:45:26.22611-03');


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: features; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.features (code, name, description, created_at) VALUES ('DATA_MIGRATION', 'Migración de datos', 'Importación inicial y migraciones operativas seguras', '2026-08-14 15:37:39.614513-03');


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: plans; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.plans (code, name, catalog_status, is_development, created_at, commercial_class, description, target_audience, highlighted_features, display_order, recommended, cta_text, price_label) VALUES ('DEVELOPMENT', 'Desarrollo', 'development', true, '2026-08-14 15:37:39.619143-03', 'non_commercial', NULL, NULL, NULL, NULL, false, NULL, NULL);
INSERT INTO miclub.plans (code, name, catalog_status, is_development, created_at, commercial_class, description, target_audience, highlighted_features, display_order, recommended, cta_text, price_label) VALUES ('FREE', 'Free', 'catalog', false, '2026-08-14 15:37:39.619143-03', 'free', 'Empezá a organizar tu institución y completá el onboarding.', 'Clubes que quieren conocer miClub.', '{"Onboarding completo","Configuración inicial del club","Sin importación de datos"}', 1, false, 'Continuar con Free', 'Precio próximamente');
INSERT INTO miclub.plans (code, name, catalog_status, is_development, created_at, commercial_class, description, target_audience, highlighted_features, display_order, recommended, cta_text, price_label) VALUES ('SOCIAL', 'Social', 'catalog', false, '2026-08-27 14:24:11.791696-03', 'paid', 'Centralizá la gestión cotidiana y probá la migración de datos.', 'Clubes sociales y equipos en crecimiento.', '{"Todo lo necesario para comenzar","Migración desde XLSX","Acceso de prueba en sandbox"}', 2, false, 'Probar Social', 'Precio próximamente');
INSERT INTO miclub.plans (code, name, catalog_status, is_development, created_at, commercial_class, description, target_audience, highlighted_features, display_order, recommended, cta_text, price_label) VALUES ('COMPLEX', 'Complex', 'catalog', false, '2026-08-27 14:24:11.791696-03', 'paid', 'Coordiná una operación con más sectores, actividades y responsables.', 'Complejos deportivos con operación diversa.', '{"Gestión para múltiples áreas","Migración desde XLSX","Acceso de prueba en sandbox"}', 3, true, 'Probar Complex', 'Precio próximamente');
INSERT INTO miclub.plans (code, name, catalog_status, is_development, created_at, commercial_class, description, target_audience, highlighted_features, display_order, recommended, cta_text, price_label) VALUES ('CLUB', 'Club', 'catalog', false, '2026-08-27 14:24:11.791696-03', 'paid', 'Prepará una gestión integral para una institución de mayor escala.', 'Clubes con una estructura amplia.', '{"Gestión institucional integral","Migración desde XLSX","Acceso de prueba en sandbox"}', 4, false, 'Probar Club', 'Precio próximamente');


--
-- PostgreSQL database dump complete
--



--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: plan_entitlements; Type: TABLE DATA; Schema: miclub; Owner: -
--

INSERT INTO miclub.plan_entitlements (plan_code, feature_code, created_at) VALUES ('DEVELOPMENT', 'DATA_MIGRATION', '2026-08-14 15:37:39.624329-03');
INSERT INTO miclub.plan_entitlements (plan_code, feature_code, created_at) VALUES ('CLUB', 'DATA_MIGRATION', '2026-08-27 14:24:11.798002-03');
INSERT INTO miclub.plan_entitlements (plan_code, feature_code, created_at) VALUES ('SOCIAL', 'DATA_MIGRATION', '2026-08-27 14:24:11.813699-03');
INSERT INTO miclub.plan_entitlements (plan_code, feature_code, created_at) VALUES ('COMPLEX', 'DATA_MIGRATION', '2026-08-27 14:24:11.813699-03');


--
-- PostgreSQL database dump complete
--




-- The API connects with SET ROLE miclub_runtime. The first RLS rollout granted
-- only its priority tables, unintentionally removing access to clubs and the
-- remaining catalogs/read models needed by registration, onboarding and XLSX.
-- HTTP authorization and explicit tenant predicates remain mandatory; priority
-- tenant tables continue to be FORCE RLS and fail closed without app.club_id.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA miclub TO miclub_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA miclub TO miclub_runtime;

-- Keep later application tables usable when migrations are executed by the
-- current schema owner. RLS policies are not changed or bypassed by this grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA miclub
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO miclub_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA miclub
  GRANT USAGE, SELECT ON SEQUENCES TO miclub_runtime;

DO $validation$
BEGIN
  IF NOT has_table_privilege('miclub_runtime', 'miclub.clubs', 'INSERT')
     OR NOT has_table_privilege('miclub_runtime', 'miclub.plans', 'SELECT')
     OR NOT has_table_privilege('miclub_runtime', 'miclub.club_onboarding', 'INSERT')
     OR NOT has_table_privilege('miclub_runtime', 'miclub.xlsx_import_rows', 'INSERT') THEN
    RAISE EXCEPTION 'No se pudieron restaurar los permisos operativos de miclub_runtime';
  END IF;
END
$validation$;
GRANT SELECT ON miclub.sector_templates, miclub.activity_icon_catalog, miclub.activity_icon_aliases TO miclub_runtime;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM miclub.clubs) OR EXISTS (SELECT 1 FROM miclub.users) THEN RAISE EXCEPTION 'Baseline unexpectedly contains tenant identities'; END IF; END $$;
GRANT USAGE ON SCHEMA miclub TO miclub_runtime, miclub_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA miclub TO miclub_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA miclub TO miclub_admin;
GRANT SELECT ON public.miclub_schema_migrations TO miclub_runtime;
COMMIT;
