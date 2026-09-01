import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./liquidityQueries.ts", import.meta.url), "utf8");

test("la liquidez delega toda valoración a la función canónica", () => {
  assert.match(source, /miclub\.value_club_liquidity\(\$1,current_date\)/);
  assert.doesNotMatch(source, /exchange_rates|balance \*|balance \//);
  assert.match(source, /valuation_status='COMPLETE'/);
});
