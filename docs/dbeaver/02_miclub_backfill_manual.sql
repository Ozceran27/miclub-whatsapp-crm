/* CORRECCIÓN MANUAL — ejecutar sólo tras 01 y backup verificado.
   No crea credenciales: la identidad se crea con npm run bootstrap:director.
   Idempotente: sólo completa club_id NULL; no cambia UUID, montos, fechas ni estados.
   Rollback antes de COMMIT: ROLLBACK. Después: restaurar el backup previo (los valores
   NULL originales no pueden inferirse de forma segura, por diseño). */
-- Es obligatorio limpiar primero cualquier transacción abortada (25P02). Este
-- ROLLBACK es inocuo si DBeaver está en autocommit o no hay transacción activa.
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15min';

DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM miclub.clubs WHERE lower(name)=lower('miClub') OR lower(email)=lower('miclub.posadas@gmail.com');
 IF n<>1 THEN RAISE EXCEPTION 'Precondition: se esperaba exactamente un club miClub, encontrados %',n; END IF;
 IF EXISTS(SELECT 1 FROM miclub.user_club_memberships m JOIN miclub.roles r ON r.id=m.role_id
           WHERE m.club_id<>r.club_id) THEN RAISE EXCEPTION 'Existen membresías con rol de otro club'; END IF;
END $$;

CREATE TEMP TABLE _before AS
SELECT (SELECT count(*) FROM miclub.movements) movements_count,
       (SELECT coalesce(sum(amount),0) FROM miclub.movements WHERE upper(movement_type::text)='INGRESOS') ingresos,
       (SELECT coalesce(sum(amount),0) FROM miclub.movements WHERE upper(movement_type::text)='EGRESOS') egresos,
       (SELECT count(*) FROM miclub.enrollments) enrollments_count,
       (SELECT count(*) FROM miclub.people) people_count;

/* Lista derivada del schema versionado: sólo entidades tenant, nunca clubs/roles/permisos globales. */
DO $$ DECLARE t text; cid uuid; BEGIN
 SELECT id INTO STRICT cid FROM miclub.clubs WHERE lower(name)=lower('miClub') OR lower(email)=lower('miclub.posadas@gmail.com');
 FOREACH t IN ARRAY ARRAY[
  'people','person_kind_links','club_memberships','sectors','activities','activity_schedules',
  'instructors','enrollments','movements','movement_categories','payment_methods','payments',
  'receivables','payment_allocations','operational_balances','sector_settlements',
  'sheet_metric_snapshots','enrollment_fee_audit','activity_fee_history',
  'activity_fee_cleanup_candidates','import_batches','import_errors','crm_message_templates',
  'crm_message_history','audit_log','salon_hour_prices','discount_rates'
 ] LOOP
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='miclub' AND table_name=t AND column_name='club_id') THEN
   EXECUTE format('UPDATE miclub.%I SET club_id=$1 WHERE club_id IS NULL',t) USING cid;
  END IF;
 END LOOP;
END $$;

DO $$ DECLARE b _before%rowtype; BEGIN
 SELECT * INTO b FROM _before;
 IF b.movements_count<>(SELECT count(*) FROM miclub.movements)
 OR b.ingresos<>(SELECT coalesce(sum(amount),0) FROM miclub.movements WHERE upper(movement_type::text)='INGRESOS')
 OR b.egresos<>(SELECT coalesce(sum(amount),0) FROM miclub.movements WHERE upper(movement_type::text)='EGRESOS')
 OR b.enrollments_count<>(SELECT count(*) FROM miclub.enrollments)
 OR b.people_count<>(SELECT count(*) FROM miclub.people) THEN
  RAISE EXCEPTION 'Los conteos o totales financieros cambiaron; rollback';
 END IF;
END $$;
COMMIT;

/* Validación post-commit: ejecutar también 03_final_validation_readonly.sql. */
SELECT * FROM _before; -- La tabla TEMP vive hasta cerrar esta conexión DBeaver.
