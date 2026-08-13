import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const diagnosticUrl = new URL("../../../../docs/activity-settlements-historical-diagnostic.sql", import.meta.url);
const baseSchemaUrl = new URL("../../db/migrations/202606260001_create_miclub_import_schema.sql", import.meta.url);

test("el diagnóstico histórico usa las columnas canónicas de movements", async () => {
  const [diagnostic, baseSchema] = await Promise.all([
    readFile(diagnosticUrl, "utf8"),
    readFile(baseSchemaUrl, "utf8"),
  ]);

  assert.match(baseSchema, /movement_date timestamptz not null/i);
  assert.match(baseSchema, /concept text not null/i);
  assert.match(diagnostic, /m\.movement_date/i);
  assert.match(diagnostic, /m\.concept/i);
  assert.doesNotMatch(diagnostic, /m\.occurred_at/i);
  assert.doesNotMatch(diagnostic, /m\.description/i);
});
