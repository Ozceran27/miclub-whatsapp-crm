import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const name = '202609090002_financial_operating_circuit.sql';
const sql = (await readFile(`apps/api/db/migrations/${name}`, 'utf8')).replace(/\r\n/g, '\n');
const checksum = createHash('sha256').update(sql).digest('hex');
const manifestPath = 'apps/api/src/scripts/migrationManifest.ts';
let manifest = await readFile(manifestPath, 'utf8');
const entry = `  { path: "${name}", sha256: "${checksum}", dependsOn: ["202609090001_reservations_and_deposits_categories.sql"], checkpointPurpose: "Historia financiera, revisiones, devoluciones, compensaciones y conciliación inicial DEC-017." },`;
if (manifest.includes(`path: "${name}"`)) manifest = manifest.replace(new RegExp(`^.*path: "${name}".*$`, 'm'), entry);
else manifest = manifest.replace(/(^.*path: "202609090001_reservations_and_deposits_categories.sql".*$)/m, `$1\n${entry}`);
await writeFile(manifestPath, manifest);
const { renderPostAdminMigrationTable, renderTenantDeletionManifestValues } = await import('./migrationManifest.js');
const checkpoint = 'docs/history/checkpoint-post-admin.md';
await writeFile(checkpoint, (await readFile(checkpoint, 'utf8')).replace(/<!-- POST_ADMIN_MIGRATIONS:START -->[\s\S]*?<!-- POST_ADMIN_MIGRATIONS:END -->/, `<!-- POST_ADMIN_MIGRATIONS:START -->\n${renderPostAdminMigrationTable()}\n<!-- POST_ADMIN_MIGRATIONS:END -->`));
for (const path of ['docs/dbeaver/tenant-deletion/01_tenant_inventory_readonly.sql', 'docs/dbeaver/tenant-deletion/02_delete_tenant_manual.sql']) {
  try { await writeFile(path, (await readFile(path, 'utf8')).replace(/-- MIGRATION_MANIFEST_VALUES:START[\s\S]*?-- MIGRATION_MANIFEST_VALUES:END/g, `-- MIGRATION_MANIFEST_VALUES:START\n${renderTenantDeletionManifestValues()}\n-- MIGRATION_MANIFEST_VALUES:END`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
await writeFile('docs/dbeaver/2026-09-09-circuito-financiero.sql', `-- Ejecutar completo en DBeaver, como propietario del schema, con backup verificado.
-- Antes del COMMIT: ROLLBACK revierte todo. Tras registrar operaciones: reversión
-- mediante ajustes auditados; no borrar tablas ni historia financiera.
SELECT current_database(),current_user;
BEGIN;
SELECT pg_advisory_xact_lock(817320260908);
DO $install$
BEGIN
 IF to_regclass('public.miclub_schema_migrations') IS NULL THEN RAISE EXCEPTION 'Falta ledger canónico'; END IF;
 IF EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='${name}' AND checksum<>'${checksum}') THEN RAISE EXCEPTION 'Checksum incompatible'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.miclub_schema_migrations WHERE name='${name}') THEN
  EXECUTE $migration$${sql}$migration$;
  INSERT INTO public.miclub_schema_migrations(name,checksum) VALUES('${name}','${checksum}');
 END IF;
 IF to_regclass('miclub.finance_history') IS NULL OR to_regclass('miclub.settlement_reviews') IS NULL THEN RAISE EXCEPTION 'Validación estructural fallida'; END IF;
END $install$;
SELECT activity_id,id AS term_id,effective_from,effective_to,mode,fixed_fee_frequency,
 responsible_person_id,partial_month_policy FROM miclub.activity_terms
WHERE responsible_person_id IS NULL OR (mode='FIXED' AND (partial_month_policy IS NULL OR fixed_fee_frequency<>'MONTHLY'));
COMMIT;
`);
