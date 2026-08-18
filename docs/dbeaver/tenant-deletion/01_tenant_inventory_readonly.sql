-- miClub — diagnóstico previo a la eliminación de un tenant (SOLO LECTURA).
-- Ejecutar en DBeaver contra el destino real y exportar todos los result sets.
-- No presupone las tablas de un dump: descubre el catálogo PostgreSQL vigente.
BEGIN TRANSACTION READ ONLY;

-- 1. Identidad del destino. Conservar esta evidencia junto con la revisión DBA.
SELECT current_database() AS database_name, current_user AS database_user,
       inet_server_addr() AS server_address, inet_server_port() AS server_port,
       current_setting('server_version') AS server_version,
       current_schema() AS current_schema,
       current_setting('search_path') AS search_path,
       to_regnamespace('miclub') AS business_schema,
       to_regnamespace('public') AS runner_metadata_schema,
       now() AS observed_at;

-- Base de datos y schemas son niveles diferentes. En miclub_gestion se espera:
--   miclub.* = datos de negocio; public.miclub_schema_migrations = metadata del runner.
-- Que los datos estén en miclub NO implica que el ledger deba estar allí.
SELECT current_database() AS database_name,
       CASE WHEN current_database()='miclub_gestion' THEN 'EXPECTED_DATABASE'
            ELSE 'BLOCKED_WRONG_DATABASE' END AS database_check,
       CASE WHEN to_regnamespace('miclub') IS NOT NULL THEN 'BUSINESS_SCHEMA_PRESENT'
            ELSE 'BLOCKED_MICLUB_SCHEMA_MISSING' END AS miclub_schema_check,
       CASE WHEN to_regnamespace('public') IS NOT NULL THEN 'RUNNER_METADATA_SCHEMA_PRESENT'
            ELSE 'BLOCKED_PUBLIC_SCHEMA_MISSING' END AS public_schema_check;

-- 2. Tablas tenant-scoped descubiertas por una columna club_id y conteos por club.
SELECT c.table_schema, c.table_name, c.data_type AS club_id_type,
       (xpath('/row/n/text()', query_to_xml(
          format('SELECT count(*) AS n FROM %I.%I WHERE club_id IS NOT NULL', c.table_schema, c.table_name),
          false, true, '')))[1]::text::bigint AS total_tenant_rows,
       format('SELECT %L AS table_name, club_id, count(*) FROM %I.%I GROUP BY club_id ORDER BY club_id;',
              c.table_schema || '.' || c.table_name, c.table_schema, c.table_name) AS dbeaver_count_query
FROM information_schema.columns c
JOIN information_schema.tables t USING (table_schema, table_name)
WHERE c.column_name='club_id' AND t.table_type='BASE TABLE'
  AND c.table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY c.table_schema,c.table_name;
-- Ejecutar las consultas de dbeaver_count_query para obtener el detalle por club.

-- 3. FKs salientes y entrantes de cada tabla tenant-scoped (incluye tablas sin club_id dependientes).
WITH tenant AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='club_id' AND NOT a.attisdropped
  WHERE c.relkind IN ('r','p')
)
SELECT con.conname,
       con.conrelid::regclass AS outgoing_from,
       con.confrelid::regclass AS incoming_to,
       pg_get_constraintdef(con.oid,true) AS definition,
       con.conrelid IN (SELECT oid FROM tenant) AS source_is_tenant_scoped,
       con.confrelid IN (SELECT oid FROM tenant) AS target_is_tenant_scoped
FROM pg_constraint con
WHERE con.contype='f' AND (con.conrelid IN (SELECT oid FROM tenant) OR con.confrelid IN (SELECT oid FROM tenant))
-- PostgreSQL permite usar un alias simple en ORDER BY, pero no resolverlo dentro
-- de una expresión como incoming_to::text (42703). Ordenar por las expresiones
-- originales conserva el resultado y funciona en todas las versiones soportadas.
ORDER BY con.confrelid::regclass::text,con.conrelid::regclass::text,con.conname;

-- 4. Objetos globales: tablas sin club_id, con estimación y conteo exacto.
SELECT n.nspname AS table_schema,c.relname AS table_name,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I',n.nspname,c.relname),false,true,'')))[1]::text::bigint AS row_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('miclub','public')
AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='club_id' AND NOT a.attisdropped)
ORDER BY n.nspname,c.relname;

-- 5. Descubrimiento del ledger. No asumir schema, nombre ni existencia.
-- Este result set permite detectar un ledger homónimo en otro schema o una vista,
-- pero sólo public.miclub_schema_migrations es válido para este runner.
SELECT n.nspname AS relation_schema,c.relname AS relation_name,
       CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED TABLE'
         WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
         WHEN 'f' THEN 'FOREIGN TABLE' ELSE c.relkind::text END AS relation_kind,
       pg_get_userbyid(c.relowner) AS relation_owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname ILIKE '%schema%migration%' OR c.relname ILIKE '%migration%ledger%'
ORDER BY n.nspname,c.relname;

-- 6. Gate del ledger: comparación exacta con migrationManifest.ts de este commit.
-- La ausencia se informa como BLOCKED; no se crea ni se completa el ledger aquí.
SELECT to_regclass('public.miclub_schema_migrations') AS ledger_relation,
       CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL
            THEN 'BLOCKED_TENANT_DELETE_LEDGER_MISSING'
            ELSE 'LEDGER_AVAILABLE_REVIEW_COMPARISON' END AS ledger_status,
       CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL
            THEN 'DETENER: verificar conexión e historial de despliegue con DBA; no ejecutar 02_delete_tenant_manual.sql'
            ELSE 'Revisar comparación: continuar sólo con gate_status=PASS' END AS next_action;
WITH expected(name,checksum) AS (VALUES
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
    ('202608160001_commercial_plan_taxonomy.sql', '5822085b878c63e49b4499f20671f1bd5b19d1ab8841c4238e8473e585462c8c'),
    ('202608180001_enrollment_operational_lifecycle.sql', '6e85099d6ac3932c598447b648c3c1dd06ad8e13afc0255aed02ae1587f3e119'),
    ('202608180002_restore_runtime_application_grants.sql', '65d5037ea1e47bcd7e5f8feaa56fbf9e0629a2a23fe8473c8017a72f4ca352ea'),
    ('202608180003_fix_rls_login_membership_resolution.sql', '52aa5727fcd1f89b91b8c3e16896f04c43568f988873542040188ae29dcd0335')
-- MIGRATION_MANIFEST_VALUES:END
), ledger_document AS (
 SELECT CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL
             THEN xmlparse(document '<table/>')
             ELSE query_to_xml('SELECT name, checksum FROM public.miclub_schema_migrations ORDER BY name',false,true,'') END AS document
), actual AS (
 SELECT name_node::text AS name, checksum_node::text AS checksum
 FROM ledger_document,
 LATERAL unnest(xpath('/table/row/name/text()',document),xpath('/table/row/checksum/text()',document)) AS row(name_node,checksum_node)
)
SELECT coalesce(e.name,a.name) AS migration,e.checksum AS expected_checksum,a.checksum AS actual_checksum,
 CASE WHEN e.name IS NULL THEN 'UNEXPECTED_IN_DESTINATION'
      WHEN a.name IS NULL THEN 'MISSING_IN_DESTINATION'
      WHEN e.checksum<>a.checksum THEN 'CHECKSUM_MISMATCH' ELSE 'OK' END AS status
FROM expected e FULL JOIN actual a USING(name)
ORDER BY migration;

-- Resumen obligatorio: debe devolver exactamente mismatches=0 y ledger_rows=manifest_rows.
WITH expected(name,checksum) AS (VALUES
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
    ('202608160001_commercial_plan_taxonomy.sql', '5822085b878c63e49b4499f20671f1bd5b19d1ab8841c4238e8473e585462c8c'),
    ('202608180001_enrollment_operational_lifecycle.sql', '6e85099d6ac3932c598447b648c3c1dd06ad8e13afc0255aed02ae1587f3e119'),
    ('202608180002_restore_runtime_application_grants.sql', '65d5037ea1e47bcd7e5f8feaa56fbf9e0629a2a23fe8473c8017a72f4ca352ea'),
    ('202608180003_fix_rls_login_membership_resolution.sql', '52aa5727fcd1f89b91b8c3e16896f04c43568f988873542040188ae29dcd0335')
-- MIGRATION_MANIFEST_VALUES:END
), ledger_document AS (
 SELECT CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL
             THEN xmlparse(document '<table/>')
             ELSE query_to_xml('SELECT name, checksum FROM public.miclub_schema_migrations ORDER BY name',false,true,'') END AS document
), actual AS (
 SELECT name_node::text AS name, checksum_node::text AS checksum
 FROM ledger_document,
 LATERAL unnest(xpath('/table/row/name/text()',document),xpath('/table/row/checksum/text()',document)) AS row(name_node,checksum_node)
), comparison AS (
 SELECT e.name AS expected_name,a.name AS actual_name,e.checksum expected_checksum,a.checksum actual_checksum
 FROM expected e FULL JOIN actual a USING(name)
)
SELECT CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL THEN 'BLOCKED_TENANT_DELETE_LEDGER_MISSING'
            WHEN count(*) FILTER (WHERE expected_name IS NULL OR actual_name IS NULL OR expected_checksum<>actual_checksum)=0 THEN 'PASS'
            ELSE 'BLOCKED_LEDGER_MISMATCH' END AS gate_status,
       CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL THEN NULL
            ELSE count(*) FILTER (WHERE expected_name IS NULL OR actual_name IS NULL OR expected_checksum<>actual_checksum) END AS mismatches,
       (SELECT count(*) FROM actual) AS ledger_rows,(SELECT count(*) FROM expected) AS manifest_rows,
       CASE WHEN to_regclass('public.miclub_schema_migrations') IS NULL
            THEN format('NOT_COMPARABLE: ledger ausente; %s filas esperadas no equivalen a %s mismatches',
                        (SELECT count(*) FROM expected),(SELECT count(*) FROM expected))
            WHEN count(*) FILTER (WHERE expected_name IS NULL OR actual_name IS NULL OR expected_checksum<>actual_checksum)=0
            THEN 'COMPARABLE_AND_EQUAL' ELSE 'COMPARABLE_BUT_DIFFERENT' END AS comparison_status
FROM comparison;
ROLLBACK;
