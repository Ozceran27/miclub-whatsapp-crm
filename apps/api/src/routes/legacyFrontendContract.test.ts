import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.resolve(import.meta.dirname, relativePath), "utf8");

test("the legacy root routes retained by the API match current frontend consumers", () => {
  const frontend = source("../../../web/src/services/api/homeApi.ts") + source("../../../web/src/services/api/crmApi.ts");
  const consumed = new Set([...frontend.matchAll(/apiJson(?:<[^>]+>)?\((?:`|')([^`']+)/g), ...frontend.matchAll(/get<[^>]+>\((?:`|')([^`']+)/g)].map((match) => match[1].split("?")[0]));
  const expected = new Set([
    "/summary", "/members", "/debtors", "/sync-status", "/club-finance-summary", "/sector-operational-summary",
    "/templates", "/templates/${id}", "/templates/reset-defaults", "/contacted-recent", "/history", "/history/${id}/status",
    "/prepare-messages/validate", "/prepare-messages",
  ]);
  assert.deepEqual(consumed, expected);

  const apiRoutes = source("legacyCompatRoutes.ts") + source("crmRoutes.ts");
  for (const route of expected) {
    const staticPrefix = route.split("${")[0];
    assert.ok(apiRoutes.includes(`\"${staticPrefix}`), `missing API contract for ${route}`);
  }
});
