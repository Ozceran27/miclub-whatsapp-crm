import assert from "node:assert/strict";
import test from "node:test";
import { prepareMigrationSql } from "./migrationCompatibility.js";

test("el bootstrap recrea el dashboard cuando cambia el orden histórico", () => {
  const sql = prepareMigrationSql(
    "202606270001_align_existing_miclub_for_sheets_import.sql",
    "create or replace view miclub.v_dashboard_basic as select 1;",
  );
  assert.match(sql, /drop view if exists miclub\.v_dashboard_basic;\ncreate view/);
});

test("el bootstrap recrea receivables y su dashboard dependiente al insertar columnas", () => {
  const sql = prepareMigrationSql(
    "202606280003_fix_pending_and_receivable_normalization.sql",
    "create or replace view miclub.v_enrollment_receivable_fees as select 1;",
  );
  assert.match(sql, /drop view if exists miclub\.v_dashboard_basic/);
  assert.match(sql, /drop view if exists miclub\.v_enrollment_receivable_fees/);
});

test("no altera migraciones sin una reparación declarada", () => {
  assert.equal(prepareMigrationSql("other.sql", "select 1"), "select 1");
});
