export type MigrationManifestEntry = Readonly<{
  path: string;
  sha256: string;
  /** Paths are the immutable IDs; `name` in the registry remains the basename for compatibility. */
  dependsOn?: readonly string[];
  /** PostgreSQL objects are `schema.kind.name` or `schema.table.column`. */
  provides?: readonly string[];
  requires?: readonly string[];
  /** Release-checkpoint description. Entries carrying it are rendered in the post-admin checkpoint. */
  checkpointPurpose?: string;
}>;

// This array, not directory traversal or lexical sorting, is the execution order.
// Root and multitenant migrations are deliberately interleaved below. Append only:
// YYYYMMDDHHMM_<unique-description>.sql, with a timestamp never used before in
// either directory. Historical duplicate timestamps are frozen compatibility
// exceptions because the registry stores basenames. Never reorder/rename an applied
// entry without a registry-compatible rollout for public.miclub_schema_migrations.
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
  { path: "multitenant/202607240001_create_clubs.sql", sha256: "adaad54f84493db5ec7f0a44d174f844d532eb5f9af02cfe98c991c2b09db4a8", provides: ["miclub.table.clubs"] },
  { path: "multitenant/202607240002_create_club_memberships.sql", sha256: "d981fa52b3763dbe7d69bfe3c089da5f358a94d1b6d741f6388b5d7fdcfcf5ac", dependsOn: ["multitenant/202607240001_create_clubs.sql"], requires: ["miclub.table.clubs"], provides: ["miclub.table.club_memberships"] },
  { path: "multitenant/202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql", sha256: "9a1bedeee40744bfc69cd29e3ad7efd3cd581c611e959f5ba9f9b4148f9e955a", dependsOn: ["multitenant/202607240001_create_clubs.sql"], requires: ["miclub.table.clubs"], provides: ["miclub.people.club_id", "miclub.activities.club_id", "miclub.movements.club_id"] },
  { path: "multitenant/202607250001_backfill_and_scope_unique_constraints.sql", sha256: "83630f77ba399958cdf2af8672a9532643bc05fd9bdff9c23e803040349b8843", dependsOn: ["multitenant/202607240002_create_club_memberships.sql", "multitenant/202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql"], requires: ["miclub.table.clubs", "miclub.table.club_memberships", "miclub.people.club_id"] },
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
  { path: "202607290002_reconcile_canceled_sheet_movements.sql", sha256: "6d14defb3b1b18ba7d6046cabbbfb33c7429d49308726e59bd4ee18e17fee6d4" },
  { path: "multitenant/202607290001_scope_sector_settlement_view_by_club.sql", sha256: "d5f1f35b18555b8188a9185ea46ab122a9f83ebabaa0dd950a3dd19669ac9fd3" },
  { path: "202608060001_activity_mutation_model.sql", sha256: "a4949d36c3a9dad62e9d776bf951a94104f006c1d9179daf707982829f73284b", dependsOn: ["multitenant/202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql"], checkpointPurpose: "Añade archivo, actor, índice activo e invariantes para mutaciones de actividades." },
  { path: "202608060002_tasks.sql", sha256: "d92b6d148bbfd7eed676822e7fb4b8ad8c93b5e2d9cf44cd9ccf2e3930d6b1a3", dependsOn: ["202607250003_create_user_club_authorization.sql"], checkpointPurpose: "Crea tareas tenant-scoped con normalización, restricciones e índices operativos." },
  { path: "202608060003_movement_mutation_model.sql", sha256: "1e448a1a46dc0401f89ff105397af8779602dd97e89e3c297033de3558afe628", dependsOn: ["202607280001_enforce_operational_movement_status.sql"], checkpointPurpose: "Añade conciliación y anulación, y protege movimientos finalizados o vinculados a pagos." },
  { path: "202608060004_manual_movement_creation.sql", sha256: "561cb4ca1198dbbb40c37e46aced504e0c5f809b3a4d8458e9c9200a496e28b0", dependsOn: ["202608060001_activity_mutation_model.sql", "202608060003_movement_mutation_model.sql"], checkpointPurpose: "Añade actividad e idempotencia para la creación manual de movimientos." },
  { path: "202608060005_grant_read_permissions.sql", sha256: "03d44d929656622877bff202c1ba7f791c8058d59052a7333caf189cba3ffffb", dependsOn: ["202607250003_create_user_club_authorization.sql"], checkpointPurpose: "Conserva el acceso de lectura de roles administrativos al hacer explícitos los permisos read." },
  { path: "202608060006_provision_administrative_permissions.sql", sha256: "77332672f70089e44787361c334bb5975cf2b0490d1b290100f346194561d2f2", dependsOn: ["202607250009_add_session_revocation.sql", "202608060005_grant_read_permissions.sql"], checkpointPurpose: "Provisiona permisos administrativos canónicos sin eliminar grants personalizados y revoca sesiones afectadas." },
  { path: "202608060007_backfill_granular_mutation_permissions.sql", sha256: "5d43fd56388bcd855deb7b0040dd415e429628b0123e48aa8c0301d8a743e685", dependsOn: ["202608060006_provision_administrative_permissions.sql"], checkpointPurpose: "Completa permisos granulares desde grants legacy, preserva permisos personalizados y revoca sesiones afectadas." },
  { path: "202608130001_version_activity_terms.sql", sha256: "45075d69c380cba75c46d8c9fd3a0db918f002d30e22fabc0401385c012aaffa", dependsOn: ["202608060001_activity_mutation_model.sql"], checkpointPurpose: "Versiona términos de actividades, incorpora el catálogo de iconos y protege tenant e historia." },
  { path: "202608130002_activity_settlements.sql", sha256: "684a7d82d658db5305ebd696a0b3b761b105c2eee975b1af8abef9e691f32d37", dependsOn: ["202608130001_version_activity_terms.sql", "202608060003_movement_mutation_model.sql"], checkpointPurpose: "Modela liquidaciones y asignaciones explícitas por actividad sin inferir pagos históricos." },
  { path: "202608130003_global_category_catalog.sql", sha256: "1292c2c65f2a57029854b6ce60f4dfe72ca9c9ce16ff2a178bc589d94bda722f", dependsOn: ["202608060003_movement_mutation_model.sql"], provides: ["miclub.table.category_catalog"], checkpointPurpose: "Crea el catálogo económico global clasificado y conserva movement_categories como referencia tenant compatible." },
  { path: "202608130004_secure_xlsx_import.sql", sha256: "2a9f8ff8547fb63ec6d10d51ac19374ef1dd6209529b6f63b25509bb30167837", dependsOn: ["202607250002_evolve_app_users_auth.sql", "202607250003_create_user_club_authorization.sql"], checkpointPurpose: "Añade trazabilidad, idempotencia y errores estructurados al importador XLSX seguro." },
  { path: "202608130005_xlsx_batch_identity.sql", sha256: "10ea1c80c9543c6791a0894e8283d92dacee92afaf547b7794e57715e589eeb4", dependsOn: ["202608130004_secure_xlsx_import.sql"], checkpointPurpose: "Impide reejecutar un lote XLSX real exacto salvo retry/reversal explícito." },
  { path: "202608130006_tenant_entity_sequences.sql", sha256: "8192e26dc9ba52e9b553eeac38c43b3a900150e7ec8f5f9660b0f9e3a9134485", dependsOn: ["multitenant/202607250001_backfill_and_scope_unique_constraints.sql"], provides: ["miclub.table.tenant_sequences", "miclub.function.next_tenant_sequence", "miclub.movements.sequence_number", "miclub.enrollments.sequence_number"], checkpointPurpose: "Asigna números correlativos transaccionales e independientes por club a movimientos e inscripciones." },
  { path: "202608130007_club_capabilities.sql", sha256: "226999ff0d535768ed1bf730fe2ba31acfdca84dde34217bcfebd6441987a75f", dependsOn: ["multitenant/202607240001_create_clubs.sql"], provides: ["miclub.table.club_capabilities"], checkpointPurpose: "Crea grants tenant de capabilities con fuente, actor y vigencia auditables, separados de RBAC y billing." },
  { path: "202608140001_version_xlsx_import_rows.sql", sha256: "d3cd5be5131f40fdee6f1f16c47b42bb764ac48562a17d5b0455132ba6e4da6b", dependsOn: ["202608130005_xlsx_batch_identity.sql", "202608130007_club_capabilities.sql"], provides: ["miclub.table.xlsx_import_rows"], checkpointPurpose: "Versiona las claves de filas XLSX aplicadas por club y lote sin conservar PII de la planilla." },
  { path: "202608140002_onboarding_milestones.sql", sha256: "5e11171c42736199b8775946ab66dbb07f78a62fedbaea33c17c13d1d3b7d21f", dependsOn: ["202608130007_club_capabilities.sql"], checkpointPurpose: "Distingue hitos completados de pasos omitidos y permite validar la finalización del onboarding." },
  { path: "202608140003_enforce_club_role_codes.sql", sha256: "b52a94ecfc5827768698ba5db11f1a475f09cf78ae7a0c1083f5772e16325ae5", dependsOn: ["multitenant/202607250001_backfill_and_scope_unique_constraints.sql"], checkpointPurpose: "Garantiza un único código de rol exacto por club para el aprovisionamiento y las altas de trabajadores." },
  { path: "202608140004_correct_category_catalog.sql", sha256: "00811df6648acd37dd5307c508d3986842d9fb637a66eda20f1aff24c13386a8", dependsOn: ["202608130003_global_category_catalog.sql"], requires: ["miclub.table.category_catalog"], provides: ["miclub.table.category_import_aliases"], checkpointPurpose: "Completa y corrige el catálogo económico, sus aliases y la referencia canónica obligatoria para nuevas categorías." },
  { path: "202608140005_activity_terms_contiguous.sql", sha256: "3aef03dfe3f219010280edb1548b6e6e05997ee57c639cc01d88f836bb5db30e", dependsOn: ["202608130001_version_activity_terms.sql"], checkpointPurpose: "Rechaza gaps entre versiones de términos mediante una constraint diferida, además de la exclusión de superposiciones." },
  { path: "202608140006_worker_invitations.sql", sha256: "b62667d273ce49c31f7232cfb9e69817f9aeb5dbcdd462c8c4ac88eebc758654", dependsOn: ["202608140003_enforce_club_role_codes.sql"], provides: ["miclub.table.worker_invitations"], checkpointPurpose: "Incorpora invitaciones tenant-scoped, expirables y de un solo uso antes de conceder membresía y permisos a identidades existentes." },
  { path: "202608140007_plan_entitlements.sql", sha256: "8e95a0d71cef4a45170e36bbcbe725524f12127a07a58d8fe6a1c94e6a6415ae", dependsOn: ["202608130007_club_capabilities.sql"], provides: ["miclub.table.features", "miclub.table.plans", "miclub.table.plan_entitlements", "miclub.table.club_subscriptions"], checkpointPurpose: "Separa catálogo y entitlements globales, suscripciones tenant y overrides temporales auditables, sin integrar cobros." },
  { path: "202608140008_canonical_onboarding_and_opening_balances.sql", sha256: "56c5b8b75daea283c67d31a50d853b899fcb5dbb8beb5a603113c4171689a154", dependsOn: ["202608140002_onboarding_milestones.sql", "202608060004_manual_movement_creation.sql"], provides: ["miclub.table.financial_accounts", "miclub.table.opening_balance_batches", "miclub.view.v_opening_balance_reconciliation"], checkpointPurpose: "Consolida onboarding relacional y modela saldos iniciales idempotentes, conciliables por cuenta y movimiento CAPITAL." },
  { path: "202608150001_scope_settlement_allocations_movements.sql", sha256: "e9f246695e9d020ee1132ee91acb598edf47cb073ae85ab5c934b6f47a9fe523", dependsOn: ["202608130002_activity_settlements.sql"], checkpointPurpose: "Garantiza por FK compuesta que todo movimiento asignado pertenezca al tenant de la liquidación y restringe su borrado." },
  { path: "202608150002_scope_activity_catalog_fks.sql", sha256: "270f25c059de18b4732367d21651c6e8f50081668858d2de776a1790c0c94fd2", dependsOn: ["202608130001_version_activity_terms.sql"], checkpointPurpose: "Sustituye la validación procedural de referencias de actividades por FKs tenant compuestas, restrictivas e indexadas." },
  { path: "202608150003_fix_activity_status_enum_guard.sql", sha256: "ce0e2b02f3f7863453263ed81ba27555e7b87998496b8da9f06e6048914f4ac3", dependsOn: ["202608150002_scope_activity_catalog_fks.sql"], checkpointPurpose: "Corrige el guard de actividades para comparar estados como texto sin convertir etiquetas inglesas inexistentes al enum." },
  { path: "202608150004_runtime_roles_and_priority_rls.sql", sha256: "96cbec8d8c198beb34bfeef979f8f98b9bd58a99f96af924d065b8c8dc637ce4", dependsOn: ["202608140001_version_xlsx_import_rows.sql", "202608150003_fix_activity_status_enum_guard.sql"], requires: ["postgres.role.miclub_runtime", "postgres.role.miclub_admin"], checkpointPurpose: "Valida los roles runtime y administrativo preaprovisionados, y fuerza RLS en el primer conjunto de tablas tenant críticas." },
  { path: "202608150005_prevent_split_settlement_movements.sql", sha256: "ce170d44b2fab940e69ee0761350ea11f5c4c1c0911c7a8dcd98d6fa59948d28", dependsOn: ["202608150001_scope_settlement_allocations_movements.sql"], checkpointPurpose: "Declara indivisibles los movimientos PAYMENT y ADVANCE e impide su asignación activa a más de una liquidación, incluso bajo concurrencia." },
  { path: "202608150006_remove_empty_bootstrap_legacy_club.sql", sha256: "bb561df6444fa1a4680859f0ec1f262db6e0d51b5be95a72c82fda30d78c9488", dependsOn: ["multitenant/202607250001_backfill_and_scope_unique_constraints.sql"], checkpointPurpose: "Retira el tenant legacy creado por compatibilidad sólo cuando ninguna tabla tenant lo referencia." },
  { path: "202608160001_commercial_plan_taxonomy.sql", sha256: "5822085b878c63e49b4499f20671f1bd5b19d1ab8841c4238e8473e585462c8c", dependsOn: ["202608140007_plan_entitlements.sql"], requires: ["miclub.table.plans"], provides: ["miclub.plans.commercial_class"], checkpointPurpose: "Confirma un catálogo de un plan gratuito y tres pagos, con clase comercial explícita y DEVELOPMENT reservado exclusivamente a testing, sin implementar cobros." },
  { path: "202608180001_enrollment_operational_lifecycle.sql", sha256: "6e85099d6ac3932c598447b648c3c1dd06ad8e13afc0255aed02ae1587f3e119", dependsOn: ["202608150003_fix_activity_status_enum_guard.sql", "202608060004_manual_movement_creation.sql"], checkpointPurpose: "Automatiza estados, vencimientos y cuotas adeudadas; deriva instructor/sector y sincroniza precios de actividad con inscripciones." },
  { path: "202608180002_restore_runtime_application_grants.sql", sha256: "65d5037ea1e47bcd7e5f8feaa56fbf9e0629a2a23fe8473c8017a72f4ca352ea", dependsOn: ["202608150004_runtime_roles_and_priority_rls.sql", "202608180001_enrollment_operational_lifecycle.sql"], checkpointPurpose: "Restaura al rol runtime los permisos SQL requeridos por registro, onboarding, operación e importación sin desactivar el aislamiento RLS prioritario." },
  { path: "202608180003_fix_rls_login_membership_resolution.sql", sha256: "52aa5727fcd1f89b91b8c3e16896f04c43568f988873542040188ae29dcd0335", dependsOn: ["202608180002_restore_runtime_application_grants.sql", "202608160001_commercial_plan_taxonomy.sql"], provides: ["miclub.function.resolve_login_membership"], checkpointPurpose: "Permite resolver el contexto tenant mínimo después de validar la contraseña pese a FORCE RLS y completa con FREE los clubes sin suscripción activa." },
  { path: "202608180004_fix_authenticated_membership_resolution.sql", sha256: "98e78f0019a00a6c52396fb2009c0eff06719898a027ef9dda4abd21277abfce", dependsOn: ["202608180003_fix_rls_login_membership_resolution.sql"], provides: ["miclub.function.resolve_active_membership", "miclub.function.list_active_memberships"], checkpointPurpose: "Valida y enumera membresías activas durante la rehidratación de sesión sin abrir las tablas protegidas por FORCE RLS." },
];

export const POST_ADMIN_MIGRATIONS_START = "202608060001";

/** Canonical SQL rows embedded in the DBeaver tenant-deletion ledger gates. */
export function renderTenantDeletionManifestValues(
  entries: readonly MigrationManifestEntry[] = migrationManifest,
): string {
  return entries
    .map((entry) => `    ('${pathBasename(entry.path)}', '${entry.sha256}')`)
    .join(",\n");
}

/** Canonical Markdown used by the release checkpoint and its static consistency check. */
export function renderPostAdminMigrationTable(entries: readonly MigrationManifestEntry[] = migrationManifest): string {
  const postAdmin = entries.filter((entry) => pathBasename(entry.path) >= POST_ADMIN_MIGRATIONS_START);
  const missingPurpose = postAdmin.filter((entry) => !entry.checkpointPurpose);
  if (missingPurpose.length > 0) {
    throw new Error(`Falta finalidad de checkpoint: ${missingPurpose.map((entry) => entry.path).join(", ")}`);
  }
  const rows = postAdmin.map((entry) => {
    const dependency = entry.dependsOn?.length
      ? `Después de ${entry.dependsOn.map((item) => `\`${pathBasename(item)}\``).join(" y ")}.`
      : "Sin dependencia operativa adicional.";
    return `| \`${pathBasename(entry.path)}\` | ${entry.checkpointPurpose} | \`${entry.sha256}\` | ${dependency} |`;
  });
  return [
    "| Migración | Finalidad | Checksum SHA-256 esperado | Dependencia operativa |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Duplicate timestamps that predate the manifest policy. Do not extend this set. */
export const legacyDuplicateTimestamps = new Set(["202606280003", "202607020001", "202607020004", "202607250006"]);

export function validateMigrationGraph(entries: readonly MigrationManifestEntry[]): string[] {
  const errors: string[] = [];
  const positions = new Map(entries.map((entry, index) => [entry.path, index]));
  const providers = new Map<string, number>();
  const timestamps = new Map<string, string[]>();
  entries.forEach((entry, index) => {
    const match = pathBasename(entry.path).match(/^(\d{12})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/);
    if (!match) errors.push(`Nombre inválido: ${entry.path}`);
    else timestamps.set(match[1], [...(timestamps.get(match[1]) ?? []), entry.path]);
    for (const object of entry.provides ?? []) {
      if (providers.has(object)) errors.push(`Objeto con múltiples creadores: ${object}`);
      else providers.set(object, index);
    }
  });
  for (const [timestamp, paths] of timestamps) {
    if (paths.length > 1 && !legacyDuplicateTimestamps.has(timestamp)) errors.push(`Timestamp repetido: ${timestamp}`);
  }
  entries.forEach((entry, index) => {
    for (const dependency of entry.dependsOn ?? []) {
      const dependencyIndex = positions.get(dependency);
      if (dependencyIndex === undefined) errors.push(`Dependencia no registrada: ${entry.path} -> ${dependency}`);
      else if (dependencyIndex >= index) errors.push(`Dependencia imposible: ${entry.path} -> ${dependency}`);
    }
    for (const object of entry.requires ?? []) {
      const providerIndex = providers.get(object);
      if (providerIndex !== undefined && providerIndex >= index) errors.push(`Objeto usado antes de crearse: ${entry.path} -> ${object}`);
    }
  });
  return errors;
}

export function hasOpenTransaction(sql: string): boolean {
  // Migration files may own their transaction. Ignore comments and only reject a
  // final BEGIN without COMMIT/ROLLBACK; a leading defensive ROLLBACK is allowed.
  const statements = sql
    .replace(/--.*$/gm, "")
    .match(/\b(?:begin|start\s+transaction|commit|rollback)\s*;/gi) ?? [];
  let open = false;
  for (const statement of statements) {
    if (/^(begin|start)/i.test(statement.trim())) open = true;
    else open = false;
  }
  return open;
}

function pathBasename(value: string): string {
  return value.slice(value.lastIndexOf("/") + 1);
}
