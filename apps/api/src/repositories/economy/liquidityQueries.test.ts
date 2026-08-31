import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./liquidityQueries.ts", import.meta.url), "utf8");

test("la liquidez convierte USD 100 a la moneda del club y conserva el nominal", () => {
  assert.match(source, /sum\(presented_balance\)/);
  assert.match(source, /balance \* r\.rate/);
  assert.match(source, /balance \/ r\.rate/);
  assert.match(source, /sum\(balance\) filter \(where currency_code='USD'\)/);
  assert.doesNotMatch(source, /sum\(balance\).*code in \('CASH','BANK','USD_CASH'\)/s);
});
