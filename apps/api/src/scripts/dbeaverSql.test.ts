import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = (name: string) => readFileSync(new URL(`../../../../docs/dbeaver/${name}`, import.meta.url), "utf8");
const stabilizationSql = (name: string) => sql(`stabilization-2026-08/${name}`);

test("SQL DBeaver usa las columnas reales y recupera transacciones abortadas", () => {
  const diagnostic = sql("01_auth_tenant_diagnostic_readonly.sql");
  const backfill = sql("02_miclub_backfill_manual.sql");
  const validation = sql("03_final_validation_readonly.sql");

  for (const script of [diagnostic, backfill, validation]) {
    assert.match(script, /ROLLBACK;/);
    assert.match(script, /\r?\n/);
  }
  assert.match(diagnostic, /ie\.batch_id/);
  assert.doesNotMatch(diagnostic, /ie\.import_batch_id/);
  assert.doesNotMatch(backfill, /min\s*\(\s*id\s*\)/i);
  assert.match(backfill, /movement_type::text/);
  assert.match(validation, /movement_type::text/);
});

test("SQL manual XLSX es autocontenido y no contiene rutas para pegar como sentencias", () => {
  const script = sql("17_xlsx_import_rows_manual.sql");
  assert.match(script, /^\/\*/);
  assert.match(script, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(script, /CREATE TABLE IF NOT EXISTS miclub\.xlsx_import_rows/);
  assert.match(script, /FOREIGN KEY \(batch_id,club_id\)/);
  assert.match(script, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(script, /^apps\//m);
  assert.doesNotMatch(script, /^docs\//m);
});

test("estabilización DBeaver mantiene auditoría y validación estrictamente read-only", () => {
  for (const name of ["01_audit.sql", "05_validation.sql"]) {
    const script = stabilizationSql(name);
    assert.match(script, /BEGIN TRANSACTION READ ONLY;/i);
    assert.match(script, /ROLLBACK;/i);
    assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|CALL)\b/i);
  }
});

test("estabilización DBeaver corresponde apply/rollback y conserva ejecución manual", () => {
  const cleanup = stabilizationSql("02_cleanup.sql");
  const constraints = stabilizationSql("03_constraints.sql");
  const indexes = stabilizationSql("04_indexes.sql");
  const rollback = stabilizationSql("06_rollback.sql");
  const appliedConstraints = [...constraints.matchAll(/ADD CONSTRAINT\s+(\w+)/gi)].map((match) => match[1]);
  const rolledBackConstraints = [...rollback.matchAll(/DROP CONSTRAINT IF EXISTS\s+(\w+)/gi)].map((match) => match[1]);
  assert.deepEqual(rolledBackConstraints.sort(), appliedConstraints.sort());
  assert.match(cleanup, /DROP INDEX miclub\.tasks_active_due_idx/i);
  assert.match(rollback, /CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_active_due_idx/i);
  assert.match(indexes, /CREATE INDEX CONCURRENTLY IF NOT EXISTS approval_requests_club_active_created_idx/i);
  assert.match(rollback, /DROP INDEX CONCURRENTLY IF EXISTS miclub\.approval_requests_club_active_created_idx/i);
  assert.doesNotMatch(cleanup, /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
  assert.doesNotMatch([cleanup, constraints, indexes, rollback].join("\n"), /runMigrations|postgres\.ts|node\s/i);
});

test("SQL de planes es manual, de solo lectura y no crea índices", () => {
  const plans = sql("06_application_query_plans_readonly.sql");
  assert.match(plans, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(plans, /EXPLAIN \(ANALYZE, BUFFERS/);
  assert.match(plans, /FROM pg_indexes/);
  assert.match(plans, /FROM pg_constraint/);
  assert.doesNotMatch(plans, /CREATE\s+(UNIQUE\s+)?INDEX/i);
  for (const section of ["HOME", "ECONOMÍA", "MOVIMIENTOS", "PERSONAS", "INSCRIPCIONES", "CRM"]) {
    assert.match(plans, new RegExp(`-- ${section}:`));
  }
});

test("diagnóstico de dashboard resuelve miClub sin pedir parámetros ni modificar datos", () => {
  const dashboard = sql("08_dashboard_crm_forensic_readonly.sql");
  assert.match(dashboard, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(dashboard, /lower\(trim\(name\)\)\s*=\s*lower\('miClub'\)/);
  assert.match(dashboard, /Fernando Ramos/);
  assert.match(dashboard, /without_club/);
  assert.match(dashboard, /linked_elsewhere/);
  assert.doesNotMatch(dashboard, /:club_id/);
  assert.doesNotMatch(dashboard, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
});

test("saldos iniciales usan cuentas, moneda ISO y reemplazo idempotente auditable", () => {
  const script = sql("15_financial_accounts_and_opening_balances_manual.sql");
  for (const currency of ["ARS", "USD", "BRL", "EUR"]) assert.match(script, new RegExp(`'${currency}'`));
  for (const account of ["CASH", "BANK", "USD_CASH"]) assert.match(script, new RegExp(`'${account}'`));
  assert.match(script, /UNIQUE \(club_id, code\)/i);
  assert.match(script, /account_id uuid/);
  assert.match(script, /payment_method_id[\s\S]*Canal[\s\S]*no representa la cuenta/i);
  assert.match(script, /movement_type,concept[\s\S]*'CAPITAL'/);
  assert.match(script, /'COMPLETADO','onboarding'/);
  assert.match(script, /operation IN \('REPLACE','REVERSE'\)/);
  assert.match(script, /p_cash IS NULL[\s\S]*p_cash < 0 OR p_bank < 0 OR p_usd_cash < 0/);
  assert.match(script, /idempotency_key=p_idempotency_key/);
  assert.match(script, /VALUES \('CASH',p_cash\),\('BANK',p_bank\),\('USD_CASH',p_usd_cash\)/);
  assert.match(script, /replace_opening_balances\(p_club_id,0,0,0[\s\S]*'REVERSE'/);
  assert.match(script, /v_financial_account_liquidity/);
  assert.match(script, /Snapshot\/cache reconciliable/);
  assert.doesNotMatch(script, /DELETE\s+FROM\s+miclub\.movements/i);
});

test("catálogo de sectores reutiliza códigos sistémicos existentes sin violar el índice funcional", () => {
  const script = sql("16_sector_templates_and_sector_lifecycle_manual.sql");

  assert.match(script, /^\/[\s\S]*?ROLLBACK;/);
  assert.match(script, /pg_advisory_xact_lock/);
  assert.match(script, /WHERE s\.club_id=c\.id AND lower\(btrim\(s\.code\)\)=r\.code/);
  assert.doesNotMatch(
    script,
    /WHERE NOT EXISTS \([\s\S]*?s\.archived_at IS NULL[\s\S]*?\);/,
    "la unicidad sectors_club_code_key también comprende filas archivadas",
  );
  assert.match(script, /UPDATE miclub\.sectors s[\s\S]*?SET is_system=true/);
  assert.match(script, /MANUAL_REVIEW:[\s\S]*?archivado/);
  assert.match(script, /CHECK\(status IS NULL OR status IN \('active','inactive','under_repair','archived'\)\) NOT VALID/);
  assert.doesNotMatch(script, /pg_get_constraintdef\(c\.oid\) ILIKE '%status%'/);
});

const tenantDeletionSql = (name: string) => sql(`tenant-deletion/${name}`);
const tenantResetSql = (name: string) => sql(`tenant-reset/${name}`);

function withoutSqlComments(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("precheck de reset reconoce catálogos globales reales y explica cada bloqueo", () => {
  const precheck = tenantResetSql("01_pre_reset_audit.sql");

  for (const globalTable of [
    "category_import_aliases",
    "features",
    "import_amount_normalization_rules",
    "sector_templates",
  ]) {
    assert.match(precheck, new RegExp(`'${globalTable}'`));
  }
  assert.match(precheck, /CREATE TEMP TABLE reset_precheck_checks/);
  assert.match(precheck, /no populated UNKNOWN tables/);
  assert.match(precheck, /TABLE reset_precheck_checks;/);
  assert.match(precheck, /bool_and\(passed\)/);
  assert.doesNotMatch(withoutSqlComments(precheck), /\b(?:UPDATE|MERGE|ALTER|TRUNCATE|CALL)\b/i);
});

test("diagnóstico de baja tenant descubre el destino y permanece read-only", () => {
  const diagnostic = tenantDeletionSql("01_tenant_inventory_readonly.sql");
  assert.match(diagnostic, /BEGIN TRANSACTION READ ONLY;/i);
  assert.match(diagnostic, /current_database\(\)='miclub_gestion'/);
  assert.match(diagnostic, /to_regnamespace\('miclub'\)/);
  assert.match(diagnostic, /to_regnamespace\('public'\)/);
  assert.match(diagnostic, /information_schema\.columns/);
  assert.match(diagnostic, /pg_constraint/);
  assert.match(diagnostic, /ORDER BY con\.confrelid::regclass::text,con\.conrelid::regclass::text,con\.conname/);
  assert.doesNotMatch(diagnostic, /ORDER BY incoming_to::text,outgoing_from::text/);
  assert.match(diagnostic, /query_to_xml/);
  assert.match(diagnostic, /public\.miclub_schema_migrations/);
  assert.match(diagnostic, /to_regclass\('public\.miclub_schema_migrations'\)/);
  assert.match(diagnostic, /BLOCKED_TENANT_DELETE_LEDGER_MISSING/);
  assert.match(diagnostic, /c\.relname ILIKE '%schema%migration%'/);
  assert.match(diagnostic, /NOT_COMPARABLE: ledger ausente/);
  assert.match(diagnostic, /THEN NULL\s+ELSE count\(\*\) FILTER/);
  assert.match(diagnostic, /query_to_xml\('SELECT name, checksum FROM public\.miclub_schema_migrations/);
  assert.doesNotMatch(diagnostic, /actual AS \(\s*SELECT name,checksum FROM public\.miclub_schema_migrations/);
  assert.match(diagnostic, /mismatches/);
  assert.doesNotMatch(withoutSqlComments(diagnostic), /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|CALL)\b/i);
});

test("baja tenant manual exige identidad, backup, manifest, orden FK y rollback seguro", async () => {
  const script = tenantDeletionSql("02_delete_tenant_manual.sql");
  const { migrationManifest } = await import("./migrationManifest.js");

  assert.match(script, /\$\{club_id\}/);
  assert.match(script, /\$\{expected_club_name\}/);
  assert.match(script, /\$\{backup_reference\}/);
  assert.match(script, /^--[\s\S]*\nBEGIN;/);
  assert.match(script, /_backup_/);
  assert.match(script, /pg_constraint/);
  assert.match(script, /NOT EXISTS\(SELECT 1 FROM miclub\.user_club_memberships m WHERE m\.user_id=u\.id\)/);
  assert.match(script, /_global_before/);
  assert.match(script, /fk\.confrelid=to_regclass\('miclub\.users'\) AND fk\.confdeltype='c'/);
  assert.match(script, /se eliminó un usuario que conserva membresías/);
  assert.match(script, /ROLLBACK;\s*$/);
  assert.doesNotMatch(withoutSqlComments(script), /\bTRUNCATE\b/i);
  assert.match(script, /NO usar desde la app ni migration runner/i);
  assert.match(script, /public\.miclub_schema_migrations no existe/);
  assert.match(script, /EXECUTE 'SELECT count\(\*\) FROM _expected_manifest/);

  for (const entry of migrationManifest) {
    const basename = entry.path.split("/").at(-1)!;
    assert.match(script, new RegExp(`\\('${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}', '${entry.sha256}'\\)`));
  }
  const manifestRows = [...script.matchAll(/^\s*\('[^']+\.sql', '[0-9a-f]{64}'\)[,;]$/gm)];
  assert.equal(manifestRows.length, migrationManifest.length);
});
