-- miClub — eliminación manual y transaccional de UN tenant.
-- EXCLUSIVO DBeaver/psql, con backup verificado y revisión DBA. NO usar desde la app ni migration runner.
-- Parámetros DBeaver obligatorios (sin valores por defecto): ${club_id}, ${expected_club_name}, ${backup_reference}.
-- La sentencia final es ROLLBACK por seguridad. El DBA puede sustituir únicamente esa última sentencia por COMMIT.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30min';
SELECT pg_advisory_xact_lock(hashtextextended('miclub:tenant-delete:' || '${club_id}',0));

CREATE TEMP TABLE _tenant_delete_parameters AS
SELECT CAST('${club_id}' AS uuid) club_id, CAST('${expected_club_name}' AS text) expected_club_name,
       CAST('${backup_reference}' AS text) backup_reference;
DO $$ BEGIN
 IF length(btrim((SELECT backup_reference FROM _tenant_delete_parameters))) < 8 THEN
   RAISE EXCEPTION 'backup_reference obligatorio: registrar un pg_dump/restore probado o snapshot aprobado';
 END IF;
 IF (SELECT count(*) FROM miclub.clubs c JOIN _tenant_delete_parameters p ON c.id=p.club_id AND c.name=p.expected_club_name) <> 1 THEN
   RAISE EXCEPTION 'club_id inexistente o expected_club_name no coincide';
 END IF;
END $$;

-- Gate innegociable: el ledger del DESTINO REAL debe coincidir exactamente con migrationManifest.ts.
CREATE TEMP TABLE _expected_manifest(name text PRIMARY KEY,checksum text NOT NULL);
INSERT INTO _expected_manifest(name,checksum) VALUES
-- MIGRATION_MANIFEST_VALUES:START
    ('202606260001_create_miclub_import_schema.sql', '6722dcbef45869c85ee70d67f00aeea65593a48eaf11b5df4c03d2f833d0d908'),
    ('202606270001_align_existing_miclub_for_sheets_import.sql', '06a39926e25c5c743658a57fb33550129ed679d0659e55702bb4e77c2eefa155'),
    ('202606280001_add_operational_aggregation_views.sql', '710958884d6d31716c632c32d8683f9862f389b5be4cc9d426160a3adaa2023e'),
    ('202606280002_fix_existing_finance_metric_semantics.sql', 'd8aa64d8f82c563303ad3da0e3f747b4b19cc70811fe912923b0b11e9f85046d'),
    ('202606280003_add_sheet_metric_snapshots.sql', 'f64cc3e1487c1ae684ff66b24bfda0e7ffeeee777709c4e214a8d53cf74d0f03'),
    ('202606280003_fix_pending_and_receivable_normalization.sql', '620abbf87f513ee836e027820d1197f9b7724924bc544b6413c7d7c17210bc14'),
    ('202607020001_add_enrollment_archive_columns.sql', '1441a5f23f4638898963b8f3b91385dd5dbaa3004923de1727028f70462cc460'),
    ('202607020001_align_receivables_with_effective_status.sql', 'e8ec7d733d726455a6cfc23f859fe9240cefcbb49128399d087bb95baa7e500a'),
    ('202607020002_align_receivables_with_sheet_status.sql', 'fb2a1de44c0fbd3313437867100f9cb928a790abf367d6eb304e303e95933ec9'),
    ('202607020003_backfill_aula_ec_commissions.sql', '4dabd3e4da1da78db9b24d8ce6be6828199a1026a4bf810fc8d5fc415cdee263'),
    ('202607020004_normalize_receivable_fee_scale.sql', 'bbed5e687ad7508048b6b8441718900fb188a06d93948ffe480104e6ca3f9436'),
    ('202607020004_preserve_aula_commissions_after_import.sql', 'cb8e600aa1d521cde63feb49d922f6a490abe93012aee38f8e4f15e98f54cd94'),
    ('202607020005_fix_receivable_fee_effective_status_and_scale.sql', 'fe774fb4ac745397e136ceec79cdf5f0c5ede9fe82102da408f249494c8a7b72'),
    ('202607020006_normalize_stored_enrollment_fee_amounts.sql', '2ba7554c3ae561e475d44d7d48c0ac8ae5186b504b51c95bae1c65a00dbdf1a9'),
    ('202607030001_enforce_receivable_fee_rules.sql', '33b538f4efbb4df7032e24ca268dd20d9a27377a967448e6cef8061d35a8aee7'),
    ('202607030002_sync_membership_fee_normalization.sql', 'c36e915dd475ff5e80a789b9ca0395291fbff8eea26737a28434f2ee4ce24cd6'),
    ('202607030003_enrollment_fee_normalization_audit.sql', '656165e16e22a58ea17ca008a561a9d8d19095612316d9dafdd53f9b3cd0e680'),
    ('202607030004_activity_fee_audit_and_cleanup.sql', 'c712085f18a73a4a863d08fc2a79a24f90b261cf2779091826f7537074783399'),
    ('202607030005_document_receivable_status_rule_and_debug.sql', 'd0242b4a049a4f573df469788a22b5e251f7787fb9eeed0b1d961a50bd4232bc'),
    ('202607160001_add_enrollment_date_for_growth.sql', 'db7d29f13055087109abd24230be38e1eb36afdc6064847385d7bfe84d79de57'),
    ('202607160002_add_missing_enrollment_review_batch.sql', '0ec78489690b95da51066ba7d9c040163060fc769c44c350b9235fe8d9d10fd8'),
    ('202607240001_create_clubs.sql', 'adaad54f84493db5ec7f0a44d174f844d532eb5f9af02cfe98c991c2b09db4a8'),
    ('202607240002_create_club_memberships.sql', 'd981fa52b3763dbe7d69bfe3c089da5f358a94d1b6d741f6388b5d7fdcfcf5ac'),
    ('202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql', '9a1bedeee40744bfc69cd29e3ad7efd3cd581c611e959f5ba9f9b4148f9e955a'),
    ('202607250001_backfill_and_scope_unique_constraints.sql', '83630f77ba399958cdf2af8672a9532643bc05fd9bdff9c23e803040349b8843'),
    ('202607250002_evolve_app_users_auth.sql', 'acafa9181e13e211454bf086a617c72b9bfcd83cce37d33122abccc6e8f316d7'),
    ('202607250003_create_user_club_authorization.sql', 'dfbf9cfc1e8b3b851aee1adc8d6093d2f79f362df69f9797b84dd6eb865cc587'),
    ('202607250004_scope_operational_views_by_club.sql', '2189d62fdfdb293d814704fb0010e50360c98ad45faa1363e7e17fb471802007'),
    ('202607250005_enrich_audit_log.sql', '4be064a48059242fde3ba4bf4625fd4f881a85b8866b9d618bd317648fac15bb'),
    ('202607250006_harden_public_multitenancy.sql', '1225a1363eb6e862ab5fbd3c52150c1030a81e9832203c1f7c776d56aaddd51b'),
    ('202607250006_scope_people_and_link_global_users.sql', '6f04c1cb065663012853a59137a2a5f339e62e8793ae490c284f907ab6fc0df6'),
    ('202607250007_tenant_crm_and_public_hardening.sql', 'a5acc854c282cc72bd8b37b5230d0b62a06d871596a58bd16d21856223a3437a'),
    ('202607250008_grant_management_permissions.sql', '0aecbbfc11325504fa134f90dfa93170c42d458bf1f4d567605f6e5dea9c081a'),
    ('202607250009_add_session_revocation.sql', '3a8ab34dc3608848dea6e570395f92ac1fb919d0490d92908566d1ff446c2099'),
    ('202607250010_align_import_conflict_targets.sql', '6f1ac98576774acefbc4f408a8b2a10de4c7e804b32c0b8e6b46ce3cc20e4523'),
    ('202607250011_complete_import_conflict_targets.sql', '09d4f96d6794516ef4c9a56c711d70166ecc64f9a7c3e7d5b854eef0ed1824c8'),
    ('202607280001_enforce_operational_movement_status.sql', '6df122df959125f83fa608f9283693887db41d8c5ae402f797c3e5b7c87e7dba'),
    ('202607280002_retention_and_crm_template_archive.sql', '8727f7a14f6276c8541cf9bc6eef5bbce161e69b91397d78fdc5c062499716cc'),
    ('202607290002_reconcile_canceled_sheet_movements.sql', '6d14defb3b1b18ba7d6046cabbbfb33c7429d49308726e59bd4ee18e17fee6d4'),
    ('202607290001_scope_sector_settlement_view_by_club.sql', 'd5f1f35b18555b8188a9185ea46ab122a9f83ebabaa0dd950a3dd19669ac9fd3'),
    ('202608060001_activity_mutation_model.sql', 'a4949d36c3a9dad62e9d776bf951a94104f006c1d9179daf707982829f73284b'),
    ('202608060002_tasks.sql', 'd92b6d148bbfd7eed676822e7fb4b8ad8c93b5e2d9cf44cd9ccf2e3930d6b1a3'),
    ('202608060003_movement_mutation_model.sql', '1e448a1a46dc0401f89ff105397af8779602dd97e89e3c297033de3558afe628'),
    ('202608060004_manual_movement_creation.sql', '561cb4ca1198dbbb40c37e46aced504e0c5f809b3a4d8458e9c9200a496e28b0'),
    ('202608060005_grant_read_permissions.sql', '03d44d929656622877bff202c1ba7f791c8058d59052a7333caf189cba3ffffb'),
    ('202608060006_provision_administrative_permissions.sql', '77332672f70089e44787361c334bb5975cf2b0490d1b290100f346194561d2f2'),
    ('202608060007_backfill_granular_mutation_permissions.sql', '5d43fd56388bcd855deb7b0040dd415e429628b0123e48aa8c0301d8a743e685'),
    ('202608130001_version_activity_terms.sql', '45075d69c380cba75c46d8c9fd3a0db918f002d30e22fabc0401385c012aaffa'),
    ('202608130002_activity_settlements.sql', '684a7d82d658db5305ebd696a0b3b761b105c2eee975b1af8abef9e691f32d37'),
    ('202608130003_global_category_catalog.sql', '1292c2c65f2a57029854b6ce60f4dfe72ca9c9ce16ff2a178bc589d94bda722f'),
    ('202608130004_secure_xlsx_import.sql', '2a9f8ff8547fb63ec6d10d51ac19374ef1dd6209529b6f63b25509bb30167837'),
    ('202608130005_xlsx_batch_identity.sql', '10ea1c80c9543c6791a0894e8283d92dacee92afaf547b7794e57715e589eeb4'),
    ('202608130006_tenant_entity_sequences.sql', '8192e26dc9ba52e9b553eeac38c43b3a900150e7ec8f5f9660b0f9e3a9134485'),
    ('202608130007_club_capabilities.sql', '226999ff0d535768ed1bf730fe2ba31acfdca84dde34217bcfebd6441987a75f'),
    ('202608140001_version_xlsx_import_rows.sql', 'd3cd5be5131f40fdee6f1f16c47b42bb764ac48562a17d5b0455132ba6e4da6b'),
    ('202608140002_onboarding_milestones.sql', '5e11171c42736199b8775946ab66dbb07f78a62fedbaea33c17c13d1d3b7d21f'),
    ('202608140003_enforce_club_role_codes.sql', 'b52a94ecfc5827768698ba5db11f1a475f09cf78ae7a0c1083f5772e16325ae5'),
    ('202608140004_correct_category_catalog.sql', '00811df6648acd37dd5307c508d3986842d9fb637a66eda20f1aff24c13386a8'),
    ('202608140005_activity_terms_contiguous.sql', '3aef03dfe3f219010280edb1548b6e6e05997ee57c639cc01d88f836bb5db30e'),
    ('202608140006_worker_invitations.sql', 'b62667d273ce49c31f7232cfb9e69817f9aeb5dbcdd462c8c4ac88eebc758654'),
    ('202608140007_plan_entitlements.sql', '8e95a0d71cef4a45170e36bbcbe725524f12127a07a58d8fe6a1c94e6a6415ae'),
    ('202608140008_canonical_onboarding_and_opening_balances.sql', '56c5b8b75daea283c67d31a50d853b899fcb5dbb8beb5a603113c4171689a154'),
    ('202608150001_scope_settlement_allocations_movements.sql', 'e9f246695e9d020ee1132ee91acb598edf47cb073ae85ab5c934b6f47a9fe523'),
    ('202608150002_scope_activity_catalog_fks.sql', '270f25c059de18b4732367d21651c6e8f50081668858d2de776a1790c0c94fd2'),
    ('202608150003_fix_activity_status_enum_guard.sql', 'ce0e2b02f3f7863453263ed81ba27555e7b87998496b8da9f06e6048914f4ac3'),
    ('202608150004_runtime_roles_and_priority_rls.sql', '96cbec8d8c198beb34bfeef979f8f98b9bd58a99f96af924d065b8c8dc637ce4'),
    ('202608150005_prevent_split_settlement_movements.sql', 'ce170d44b2fab940e69ee0761350ea11f5c4c1c0911c7a8dcd98d6fa59948d28'),
    ('202608150006_remove_empty_bootstrap_legacy_club.sql', 'bb561df6444fa1a4680859f0ec1f262db6e0d51b5be95a72c82fda30d78c9488'),
    ('202608160001_commercial_plan_taxonomy.sql', '5822085b878c63e49b4499f20671f1bd5b19d1ab8841c4238e8473e585462c8c')
-- MIGRATION_MANIFEST_VALUES:END
;
DO $$ DECLARE v_mismatches bigint; BEGIN
 IF to_regclass('public.miclub_schema_migrations') IS NULL THEN
   RAISE EXCEPTION 'PRECONDICION: public.miclub_schema_migrations no existe. No ejecutar la baja; verificar destino y despliegue con DBA';
 END IF;
 EXECUTE 'SELECT count(*) FROM _expected_manifest e FULL JOIN public.miclub_schema_migrations a USING(name) WHERE e.name IS NULL OR a.name IS NULL OR e.checksum<>a.checksum'
   INTO v_mismatches;
 IF v_mismatches <> 0 THEN
   RAISE EXCEPTION 'PRECONDICION: ledger != migrationManifest.ts (% diferencias); ejecutar 01_tenant_inventory_readonly.sql y detener',v_mismatches;
 END IF;
END $$;

-- Inventario efectivo y huella de TODOS los objetos globales antes de borrar.
CREATE TEMP TABLE _tenant_tables AS
SELECT c.oid,n.nspname schema_name,c.relname table_name
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='club_id' AND NOT a.attisdropped
WHERE c.relkind IN ('r','p') AND n.nspname='miclub';
CREATE TEMP TABLE _global_before(table_oid oid PRIMARY KEY,row_count bigint);
DO $$ DECLARE r record; n bigint; BEGIN
 FOR r IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relkind='r' AND n.nspname IN ('miclub','public')
          AND c.oid<>to_regclass('public.miclub_schema_migrations')
          -- users puede perder únicamente candidatos sin membresías; sus hijos
          -- ON DELETE CASCADE (por ejemplo app_sessions) también pueden variar.
          AND c.oid<>to_regclass('miclub.users')
          AND NOT EXISTS (SELECT 1 FROM pg_constraint fk
                          WHERE fk.contype='f' AND fk.conrelid=c.oid
                            AND fk.confrelid=to_regclass('miclub.users') AND fk.confdeltype='c')
          AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='club_id' AND NOT a.attisdropped)
 LOOP EXECUTE format('SELECT count(*) FROM %I.%I',r.nspname,r.relname) INTO n;
      INSERT INTO _global_before VALUES(r.oid,n); END LOOP;
END $$;

-- Respaldo transaccional adicional en pg_temp (útil para inspección/ROLLBACK; no sustituye pg_dump).
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM _tenant_tables LOOP
   EXECUTE format('CREATE TEMP TABLE %I AS SELECT * FROM %I.%I WHERE club_id=$1',
                  '_backup_'||r.table_name,r.schema_name,r.table_name)
     USING (SELECT club_id FROM _tenant_delete_parameters);
 END LOOP;
END $$;
CREATE TEMP TABLE _expected_counts(table_oid oid PRIMARY KEY, expected_rows bigint NOT NULL);
DO $$ DECLARE r record;n bigint; BEGIN
 FOR r IN SELECT * FROM _tenant_tables LOOP
   EXECUTE format('SELECT count(*) FROM pg_temp.%I','_backup_'||r.table_name) INTO n;
   INSERT INTO _expected_counts VALUES(r.oid,n);
 END LOOP;
END $$;
SELECT t.schema_name,t.table_name,e.expected_rows
FROM _expected_counts e JOIN _tenant_tables t ON t.oid=e.table_oid
ORDER BY t.table_name;
CREATE TEMP TABLE _candidate_users AS
SELECT DISTINCT user_id FROM miclub.user_club_memberships
WHERE club_id=(SELECT club_id FROM _tenant_delete_parameters);

-- Plan por FK: hijos antes que padres. La prioridad documenta auditoría/importación, CRM,
-- pagos, movimientos, inscripciones, actividades, workers, personas, membresías, roles tenant y club.
CREATE TEMP TABLE _delete_plan AS
SELECT t.*,CASE
 WHEN table_name ~ '(audit|import|diagnostic|history|cleanup)' THEN 10
 WHEN table_name ~ '(crm|message|template)' THEN 20
 WHEN table_name ~ '(payment|receivable|settlement|financial|balance)' THEN 30
 WHEN table_name ~ '(movement|category)' THEN 40
 WHEN table_name ~ 'enrollment' THEN 50
 WHEN table_name ~ 'activit' THEN 60
 WHEN table_name ~ '(worker|employee|instructor|task|approval)' THEN 70
 WHEN table_name ~ '(people|person)' THEN 80
 WHEN table_name ~ 'membership' THEN 90
 WHEN table_name='roles' THEN 100 WHEN table_name='clubs' THEN 110 ELSE 75 END priority,
 false done FROM _tenant_tables t WHERE table_name<>'clubs';

DO $$ DECLARE r record; affected bigint; remaining integer; BEGIN
 LOOP
   SELECT count(*) INTO remaining FROM _delete_plan WHERE NOT done;
   EXIT WHEN remaining=0;
   SELECT p.* INTO r FROM _delete_plan p WHERE NOT p.done
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint fk JOIN _delete_plan child ON child.oid=fk.conrelid
       WHERE fk.contype='f' AND fk.confrelid=p.oid AND NOT child.done AND child.oid<>p.oid)
     ORDER BY p.priority,p.table_name LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'ciclo FK entre tablas tenant; DBA debe revisar el diagnóstico, no usar CASCADE'; END IF;
   EXECUTE format('DELETE FROM %I.%I WHERE club_id=$1',r.schema_name,r.table_name)
     USING (SELECT club_id FROM _tenant_delete_parameters);
   GET DIAGNOSTICS affected=ROW_COUNT;
   RAISE NOTICE 'deleted %.%: %',r.schema_name,r.table_name,affected;
   UPDATE _delete_plan SET done=true WHERE oid=r.oid;
 END LOOP;
END $$;

-- Usuarios son globales: sólo candidatos del club y únicamente si ya no conservan membresías.
DELETE FROM miclub.users u USING _candidate_users c
WHERE u.id=c.user_id AND NOT EXISTS(SELECT 1 FROM miclub.user_club_memberships m WHERE m.user_id=u.id);
DELETE FROM miclub.clubs WHERE id=(SELECT club_id FROM _tenant_delete_parameters);

-- Post-delete: cero filas en cada tabla descubierta.
DO $$ DECLARE r record;n bigint; BEGIN
 FOR r IN SELECT * FROM _tenant_tables LOOP
   EXECUTE format('SELECT count(*) FROM %I.%I WHERE club_id=$1',r.schema_name,r.table_name) INTO n
     USING (SELECT club_id FROM _tenant_delete_parameters);
   IF n<>0 THEN RAISE EXCEPTION 'validación falló: %.% conserva % filas',r.schema_name,r.table_name,n; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM miclub.clubs c JOIN _tenant_delete_parameters p ON c.id=p.club_id) THEN
   RAISE EXCEPTION 'club todavía existe'; END IF;
 IF EXISTS(SELECT 1 FROM _candidate_users c
           WHERE EXISTS(SELECT 1 FROM miclub.user_club_memberships m WHERE m.user_id=c.user_id)
             AND NOT EXISTS(SELECT 1 FROM miclub.users u WHERE u.id=c.user_id)) THEN
   RAISE EXCEPTION 'se eliminó un usuario que conserva membresías'; END IF;
END $$;

-- Catálogos/objetos globales y ledger: mismos OID y conteos; ninguna fila fue tocada.
DO $$ DECLARE changed text; BEGIN
 SELECT string_agg(b.table_oid::regclass::text,', ') INTO changed FROM _global_before b
 WHERE NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=b.table_oid)
 OR b.row_count<>(xpath('/row/n/text()',query_to_xml(format('SELECT count(*) AS n FROM %s',b.table_oid::regclass),false,true,'')))[1]::text::bigint;
 IF changed IS NOT NULL THEN RAISE EXCEPTION 'objeto global alterado: %',changed; END IF;
 EXECUTE 'SELECT count(*) FROM _expected_manifest e FULL JOIN public.miclub_schema_migrations a USING(name) WHERE e.name IS NULL OR a.name IS NULL OR e.checksum<>a.checksum'
   INTO changed;
 IF changed::bigint <> 0 THEN RAISE EXCEPTION 'ledger alterado'; END IF;
END $$;
SELECT t.table_name,e.expected_rows,
 (xpath('/row/n/text()',query_to_xml(format('SELECT count(*) AS n FROM %I.%I WHERE club_id=%L',t.schema_name,t.table_name,(SELECT club_id FROM _tenant_delete_parameters)),false,true,'')))[1]::text::bigint AS remaining_rows
FROM _tenant_tables t JOIN _expected_counts e ON e.table_oid=t.oid ORDER BY t.table_name;

-- PROHIBIDO: TRUNCATE, TRUNCATE ... CASCADE y DELETE FROM clubs ... CASCADE.
-- Ensayo obligatorio: conservar ROLLBACK. Para la ventana aprobada, el DBA cambia sólo esta línea a COMMIT.
ROLLBACK;
