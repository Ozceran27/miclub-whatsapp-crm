# Readiness de migraciones (sanitizado)

- Commit inspeccionado: `cd5cb486fedd87be07fae7daeff8da987d7a9287`
- Entorno: `destino (no accesible desde este checkout)`
- Fecha de auditoría (UTC): `2026-08-07`
- Datos personales: **no consultados ni incluidos**

## Estado

La consulta de `public.miclub_schema_migrations` quedó bloqueada porque el
checkout no contiene `DATABASE_URL` ni variables `PG*`. No se inventan nombres,
checksums observados, fechas ni ejecuciones manuales. Los checksums esperados son
los declarados, entrada por entrada, en
`apps/api/src/scripts/migrationManifest.ts`; el comando
`db:readiness-report` produce la tabla comparativa completa al ejecutarse en el
host destino.

## Ledger vs. manifest

| Migración | Checksum esperado | Checksum observado | Fecha observada | Estado |
|---|---|---|---|---|
| `202606260001_create_miclub_import_schema.sql` | `6722dcbef45869c85ee70d67f00aeea65593a48eaf11b5df4c03d2f833d0d908` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202606270001_align_existing_miclub_for_sheets_import.sql` | `06a39926e25c5c743658a57fb33550129ed679d0659e55702bb4e77c2eefa155` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202606280001_add_operational_aggregation_views.sql` | `710958884d6d31716c632c32d8683f9862f389b5be4cc9d426160a3adaa2023e` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202606280002_fix_existing_finance_metric_semantics.sql` | `d8aa64d8f82c563303ad3da0e3f747b4b19cc70811fe912923b0b11e9f85046d` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202606280003_add_sheet_metric_snapshots.sql` | `f64cc3e1487c1ae684ff66b24bfda0e7ffeeee777709c4e214a8d53cf74d0f03` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202606280003_fix_pending_and_receivable_normalization.sql` | `620abbf87f513ee836e027820d1197f9b7724924bc544b6413c7d7c17210bc14` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020001_add_enrollment_archive_columns.sql` | `1441a5f23f4638898963b8f3b91385dd5dbaa3004923de1727028f70462cc460` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020001_align_receivables_with_effective_status.sql` | `e8ec7d733d726455a6cfc23f859fe9240cefcbb49128399d087bb95baa7e500a` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020002_align_receivables_with_sheet_status.sql` | `fb2a1de44c0fbd3313437867100f9cb928a790abf367d6eb304e303e95933ec9` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020003_backfill_aula_ec_commissions.sql` | `4dabd3e4da1da78db9b24d8ce6be6828199a1026a4bf810fc8d5fc415cdee263` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020004_normalize_receivable_fee_scale.sql` | `bbed5e687ad7508048b6b8441718900fb188a06d93948ffe480104e6ca3f9436` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020004_preserve_aula_commissions_after_import.sql` | `cb8e600aa1d521cde63feb49d922f6a490abe93012aee38f8e4f15e98f54cd94` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020005_fix_receivable_fee_effective_status_and_scale.sql` | `fe774fb4ac745397e136ceec79cdf5f0c5ede9fe82102da408f249494c8a7b72` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607020006_normalize_stored_enrollment_fee_amounts.sql` | `2ba7554c3ae561e475d44d7d48c0ac8ae5186b504b51c95bae1c65a00dbdf1a9` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607030001_enforce_receivable_fee_rules.sql` | `33b538f4efbb4df7032e24ca268dd20d9a27377a967448e6cef8061d35a8aee7` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607030002_sync_membership_fee_normalization.sql` | `c36e915dd475ff5e80a789b9ca0395291fbff8eea26737a28434f2ee4ce24cd6` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607030003_enrollment_fee_normalization_audit.sql` | `656165e16e22a58ea17ca008a561a9d8d19095612316d9dafdd53f9b3cd0e680` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607030004_activity_fee_audit_and_cleanup.sql` | `c712085f18a73a4a863d08fc2a79a24f90b261cf2779091826f7537074783399` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607030005_document_receivable_status_rule_and_debug.sql` | `d0242b4a049a4f573df469788a22b5e251f7787fb9eeed0b1d961a50bd4232bc` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607160001_add_enrollment_date_for_growth.sql` | `db7d29f13055087109abd24230be38e1eb36afdc6064847385d7bfe84d79de57` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607160002_add_missing_enrollment_review_batch.sql` | `0ec78489690b95da51066ba7d9c040163060fc769c44c350b9235fe8d9d10fd8` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607240001_create_clubs.sql` | `adaad54f84493db5ec7f0a44d174f844d532eb5f9af02cfe98c991c2b09db4a8` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607240002_create_club_memberships.sql` | `d981fa52b3763dbe7d69bfe3c089da5f358a94d1b6d741f6388b5d7fdcfcf5ac` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql` | `9a1bedeee40744bfc69cd29e3ad7efd3cd581c611e959f5ba9f9b4148f9e955a` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250001_backfill_and_scope_unique_constraints.sql` | `83630f77ba399958cdf2af8672a9532643bc05fd9bdff9c23e803040349b8843` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250002_evolve_app_users_auth.sql` | `acafa9181e13e211454bf086a617c72b9bfcd83cce37d33122abccc6e8f316d7` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250003_create_user_club_authorization.sql` | `dfbf9cfc1e8b3b851aee1adc8d6093d2f79f362df69f9797b84dd6eb865cc587` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250004_scope_operational_views_by_club.sql` | `2189d62fdfdb293d814704fb0010e50360c98ad45faa1363e7e17fb471802007` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250005_enrich_audit_log.sql` | `4be064a48059242fde3ba4bf4625fd4f881a85b8866b9d618bd317648fac15bb` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250006_harden_public_multitenancy.sql` | `1225a1363eb6e862ab5fbd3c52150c1030a81e9832203c1f7c776d56aaddd51b` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250006_scope_people_and_link_global_users.sql` | `6f04c1cb065663012853a59137a2a5f339e62e8793ae490c284f907ab6fc0df6` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250007_tenant_crm_and_public_hardening.sql` | `a5acc854c282cc72bd8b37b5230d0b62a06d871596a58bd16d21856223a3437a` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250008_grant_management_permissions.sql` | `0aecbbfc11325504fa134f90dfa93170c42d458bf1f4d567605f6e5dea9c081a` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250009_add_session_revocation.sql` | `3a8ab34dc3608848dea6e570395f92ac1fb919d0490d92908566d1ff446c2099` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250010_align_import_conflict_targets.sql` | `6f1ac98576774acefbc4f408a8b2a10de4c7e804b32c0b8e6b46ce3cc20e4523` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607250011_complete_import_conflict_targets.sql` | `09d4f96d6794516ef4c9a56c711d70166ecc64f9a7c3e7d5b854eef0ed1824c8` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607280001_enforce_operational_movement_status.sql` | `6df122df959125f83fa608f9283693887db41d8c5ae402f797c3e5b7c87e7dba` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607280002_retention_and_crm_template_archive.sql` | `8727f7a14f6276c8541cf9bc6eef5bbce161e69b91397d78fdc5c062499716cc` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607290002_reconcile_canceled_sheet_movements.sql` | `6d14defb3b1b18ba7d6046cabbbfb33c7429d49308726e59bd4ee18e17fee6d4` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202607290001_scope_sector_settlement_view_by_club.sql` | `d5f1f35b18555b8188a9185ea46ab122a9f83ebabaa0dd950a3dd19669ac9fd3` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060001_activity_mutation_model.sql` | `a4949d36c3a9dad62e9d776bf951a94104f006c1d9179daf707982829f73284b` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060002_tasks.sql` | `d92b6d148bbfd7eed676822e7fb4b8ad8c93b5e2d9cf44cd9ccf2e3930d6b1a3` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060003_movement_mutation_model.sql` | `1e448a1a46dc0401f89ff105397af8779602dd97e89e3c297033de3558afe628` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060004_manual_movement_creation.sql` | `561cb4ca1198dbbb40c37e46aced504e0c5f809b3a4d8458e9c9200a496e28b0` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060005_grant_read_permissions.sql` | `03d44d929656622877bff202c1ba7f791c8058d59052a7333caf189cba3ffffb` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060006_provision_administrative_permissions.sql` | `77332672f70089e44787361c334bb5975cf2b0490d1b290100f346194561d2f2` | NO CONSULTADO | NO CONSULTADA | BLOCKED |
| `202608060007_backfill_granular_mutation_permissions.sql` | `5d43fd56388bcd855deb7b0040dd415e429628b0123e48aa8c0301d8a743e685` | NO CONSULTADO | NO CONSULTADA | BLOCKED |

## Evidencia del dump disponible

- El dump histórico crea `miclub` y contiene sus datos.
- No contiene el schema `public`, `public.miclub_schema_migrations`, ni datos del ledger.
- Resultado: **no apto** para verificar una restauración contra el manifest.
- Los tres formatos conservados (plain, custom y directory) representan el mismo
  snapshot iniciado el `2026-08-06 19:15:15`; ninguno aporta el ledger omitido.

## Objetos administrativos observados en el dump

La inspección estructural, sin copiar filas de negocio al reporte, encontró las
tablas `activities`, `employees`, `approval_requests`, `tasks` y `movements`.
También encontró los índices `activities_club_active_idx`,
`tasks_club_active_idx`, `tasks_club_due_idx`,
`movements_club_reconciled_idx` y `movements_activity_id_idx`, junto con los
triggers de validación de actividades y movimientos. Esto demuestra que existen
objetos asociados a las migraciones administrativas, pero **no demuestra** qué
script los creó ni autoriza a registrar las migraciones como aplicadas.

La comparación definitiva de funciones, columnas, constraints, índices, grants,
políticas y datos transformados requiere consultar el catálogo del destino o
restaurar el dump con herramientas PostgreSQL. Dado que el ledger está ausente,
el snapshot sólo permite concluir `OBJECTS_PRESENT_LEDGER_UNVERIFIABLE`, no una
coincidencia con las migraciones.

## Anomalías

- `BLOCKED`: sin conexión configurada al entorno destino.
- `INVALID_BACKUP_FOR_LEDGER_VERIFICATION`: dump histórico sin `public`/ledger.
- `OBJECTS_PRESENT_LEDGER_UNVERIFIABLE`: existen objetos administrativos, pero
  falta el ledger necesario para establecer su procedencia y checksum.

## Scripts manuales previamente ejecutados

- `UNKNOWN`: no hay evidencia operacional suficiente en el checkout. La mera
  existencia de objetos no se considerará prueba de ejecución.

## Decisión

No se insertó ni actualizó ninguna fila del ledger. Si la consulta destino revela
objetos administrativos sin entradas, se aplicará el gate de comparación de
definiciones y reconciliación versionada con revisión DBA descrito en el runbook.
