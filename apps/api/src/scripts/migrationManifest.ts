export type MigrationManifestEntry = Readonly<{
  path: string;
  sha256: string;
}>;

// Append new migrations in dependency order. Never reorder or rename an entry that
// may already be present in public.miclub_schema_migrations without auditing that
// table first.
export const migrationManifest: readonly MigrationManifestEntry[] = [
  { path: "202606260001_create_miclub_import_schema.sql", sha256: "6722dcbef45869c85ee70d67f00aeea65593a48eaf11b5df4c03d2f833d0d908" },
  { path: "202606270001_align_existing_miclub_for_sheets_import.sql", sha256: "06a39926e25c5c743658a57fb33550129ed679d0659e55702bb4e77c2eefa155" },
  { path: "202606280001_add_operational_aggregation_views.sql", sha256: "710958884d6d31716c632c32d8683f9862f389b5be4cc9d426160a3adaa2023e" },
  { path: "202606280002_fix_existing_finance_metric_semantics.sql", sha256: "d8aa64d8f82c563303ad3da0e3f747b4b19cc70811fe912923b0b11e9f85046d" },
  { path: "202606280003_add_sheet_metric_snapshots.sql", sha256: "f64cc3e1487c1ae684ff66b24bfda0e7ffeeee777709c4e214a8d53cf74d0f03" },
  { path: "202606280003_fix_pending_and_receivable_normalization.sql", sha256: "620abbf87f513ee836e027820d1197f9b7724924bc544b6413c7d7c17210bc14" },
  { path: "202607020001_add_enrollment_archive_columns.sql", sha256: "1441a5f23f4638898963b8f3b91385dd5dbaa3004923de1727028f70462cc460" },
  { path: "202607020001_align_receivables_with_effective_status.sql", sha256: "e8ec7d733d726455a6cfc23f859fe9240cefcbb49128399d087bb95baa7e500a" },
  { path: "202607020002_align_receivables_with_sheet_status.sql", sha256: "fb2a1de44c0fbd3313437867100f9cb928a790abf367d6eb304e303e95933ec9" },
  { path: "202607020003_backfill_aula_ec_commissions.sql", sha256: "4dabd3e4da1da78db9b24d8ce6be6828199a1026a4bf810fc8d5fc415cdee263" },
  { path: "202607020004_normalize_receivable_fee_scale.sql", sha256: "bbed5e687ad7508048b6b8441718900fb188a06d93948ffe480104e6ca3f9436" },
  { path: "202607020004_preserve_aula_commissions_after_import.sql", sha256: "cb8e600aa1d521cde63feb49d922f6a490abe93012aee38f8e4f15e98f54cd94" },
  { path: "202607020005_fix_receivable_fee_effective_status_and_scale.sql", sha256: "fe774fb4ac745397e136ceec79cdf5f0c5ede9fe82102da408f249494c8a7b72" },
  { path: "202607020006_normalize_stored_enrollment_fee_amounts.sql", sha256: "2ba7554c3ae561e475d44d7d48c0ac8ae5186b504b51c95bae1c65a00dbdf1a9" },
  { path: "202607030001_enforce_receivable_fee_rules.sql", sha256: "33b538f4efbb4df7032e24ca268dd20d9a27377a967448e6cef8061d35a8aee7" },
  { path: "202607030002_sync_membership_fee_normalization.sql", sha256: "c36e915dd475ff5e80a789b9ca0395291fbff8eea26737a28434f2ee4ce24cd6" },
  { path: "202607030003_enrollment_fee_normalization_audit.sql", sha256: "656165e16e22a58ea17ca008a561a9d8d19095612316d9dafdd53f9b3cd0e680" },
  { path: "202607030004_activity_fee_audit_and_cleanup.sql", sha256: "c712085f18a73a4a863d08fc2a79a24f90b261cf2779091826f7537074783399" },
  { path: "202607030005_document_receivable_status_rule_and_debug.sql", sha256: "d0242b4a049a4f573df469788a22b5e251f7787fb9eeed0b1d961a50bd4232bc" },
  { path: "202607160001_add_enrollment_date_for_growth.sql", sha256: "db7d29f13055087109abd24230be38e1eb36afdc6064847385d7bfe84d79de57" },
  { path: "202607160002_add_missing_enrollment_review_batch.sql", sha256: "0ec78489690b95da51066ba7d9c040163060fc769c44c350b9235fe8d9d10fd8" },
  { path: "multitenant/202607240001_create_clubs.sql", sha256: "adaad54f84493db5ec7f0a44d174f844d532eb5f9af02cfe98c991c2b09db4a8" },
  { path: "multitenant/202607240002_create_club_memberships.sql", sha256: "d981fa52b3763dbe7d69bfe3c089da5f358a94d1b6d741f6388b5d7fdcfcf5ac" },
  { path: "multitenant/202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql", sha256: "9a1bedeee40744bfc69cd29e3ad7efd3cd581c611e959f5ba9f9b4148f9e955a" },
  { path: "multitenant/202607250001_backfill_and_scope_unique_constraints.sql", sha256: "83630f77ba399958cdf2af8672a9532643bc05fd9bdff9c23e803040349b8843" },
  { path: "202607250002_evolve_app_users_auth.sql", sha256: "acafa9181e13e211454bf086a617c72b9bfcd83cce37d33122abccc6e8f316d7" },
  { path: "202607250003_create_user_club_authorization.sql", sha256: "dfbf9cfc1e8b3b851aee1adc8d6093d2f79f362df69f9797b84dd6eb865cc587" },
  { path: "multitenant/202607250004_scope_operational_views_by_club.sql", sha256: "2189d62fdfdb293d814704fb0010e50360c98ad45faa1363e7e17fb471802007" },
  { path: "202607250005_enrich_audit_log.sql", sha256: "4be064a48059242fde3ba4bf4625fd4f881a85b8866b9d618bd317648fac15bb" },
  { path: "202607250006_harden_public_multitenancy.sql", sha256: "1225a1363eb6e862ab5fbd3c52150c1030a81e9832203c1f7c776d56aaddd51b" },
  { path: "multitenant/202607250006_scope_people_and_link_global_users.sql", sha256: "6f04c1cb065663012853a59137a2a5f339e62e8793ae490c284f907ab6fc0df6" },
  { path: "202607250007_tenant_crm_and_public_hardening.sql", sha256: "a5acc854c282cc72bd8b37b5230d0b62a06d871596a58bd16d21856223a3437a" },
  { path: "202607250008_grant_management_permissions.sql", sha256: "0aecbbfc11325504fa134f90dfa93170c42d458bf1f4d567605f6e5dea9c081a" },
  { path: "202607250009_add_session_revocation.sql", sha256: "3a8ab34dc3608848dea6e570395f92ac1fb919d0490d92908566d1ff446c2099" },
  { path: "202607250010_align_import_conflict_targets.sql", sha256: "6f1ac98576774acefbc4f408a8b2a10de4c7e804b32c0b8e6b46ce3cc20e4523" },
  { path: "202607250011_complete_import_conflict_targets.sql", sha256: "09d4f96d6794516ef4c9a56c711d70166ecc64f9a7c3e7d5b854eef0ed1824c8" },
  { path: "202607280001_enforce_operational_movement_status.sql", sha256: "6df122df959125f83fa608f9283693887db41d8c5ae402f797c3e5b7c87e7dba" },
  { path: "202607280002_retention_and_crm_template_archive.sql", sha256: "8727f7a14f6276c8541cf9bc6eef5bbce161e69b91397d78fdc5c062499716cc" },
];
