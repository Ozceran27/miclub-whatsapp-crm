import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = (name: string): string => readFileSync(
  new URL(`../../../../docs/dbeaver/stabilization-2026-08/${name}`, import.meta.url),
  "utf8",
);

test("el audit mantiene inventario y gates tenant completos", () => {
  const audit = script("01_audit.sql");
  for (const area of ["crm", "imports", "audit", "workers", "tasks", "requests", "catalog"]) {
    assert.match(audit, new RegExp(`'${area}'`));
  }
  assert.match(audit, /INDIRECT TENANT/);
  assert.match(audit, /relforcerowsecurity/);
  assert.match(audit, /unnest\(con\.conkey\)/);
  assert.match(audit, /rolbypassrls/);
});

test("las policies viven en 03 y su reversión en 06", () => {
  const constraints = script("03_constraints.sql");
  const rollback = script("06_rollback.sql");
  assert.match(constraints, /CREATE POLICY tenant_isolation/);
  assert.match(constraints, /FORCE ROW LEVEL SECURITY/);
  assert.match(constraints, /current_setting\('app\.club_id',true\)/);
  assert.match(constraints, /tenant foreign keys are not composite/);
  assert.match(rollback, /DROP POLICY IF EXISTS tenant_isolation/);
  assert.match(rollback, /DISABLE ROW LEVEL SECURITY/);
  for (const name of ["01_audit.sql", "02_cleanup.sql", "04_indexes.sql", "05_validation.sql"]) {
    assert.doesNotMatch(script(name), /CREATE POLICY/i);
  }
});

test("la integración omite el scope y prueba una FK cruzada", () => {
  const integration = script("07_rls_integration_test.sql");
  assert.match(integration, /SELECT count\(\*\).*FROM miclub\.people/s);
  assert.match(integration, /UPDATE miclub\.employees SET person_id/);
  assert.match(integration, /WHEN foreign_key_violation/);
  assert.match(integration, /SET LOCAL ROLE miclub_runtime/);
  assert.match(integration, /ROLLBACK/);
});
