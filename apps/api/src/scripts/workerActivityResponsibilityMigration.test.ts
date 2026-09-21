import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manualSqlUrl = new URL("../../../../docs/dbeaver/2026-09-21-responsables-trabajadores.sql", import.meta.url);

void test("el SQL manual crea responsible_employee_id antes de diagnosticarla", async () => {
  const sql = await readFile(manualSqlUrl, "utf8");
  const addColumn = sql.indexOf("ALTER TABLE miclub.activities ADD COLUMN IF NOT EXISTS responsible_employee_id uuid");
  const diagnostic = sql.indexOf("WHERE a.archived_at IS NULL AND a.responsible_employee_id IS NULL");

  assert.notEqual(addColumn, -1, "falta la creación idempotente de la columna");
  assert.notEqual(diagnostic, -1, "falta el diagnóstico de backfill");
  assert.ok(addColumn < diagnostic, "el diagnóstico no puede consultar una columna todavía inexistente");
});

void test("el SQL manual recupera reintentos y valida todas sus dependencias", async () => {
  const sql = await readFile(manualSqlUrl, "utf8");

  assert.match(sql, /^--[\s\S]*?ROLLBACK;\s*BEGIN;/);
  for (const table of ["employees", "activities", "instructors", "user_club_memberships", "roles", "sectors"]) {
    assert.match(sql, new RegExp(`to_regclass\\('miclub\\.${table}'\\)`));
  }
  assert.match(sql, /COMMIT;/);
});
