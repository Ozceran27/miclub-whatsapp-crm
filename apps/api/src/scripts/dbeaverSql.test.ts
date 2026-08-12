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
