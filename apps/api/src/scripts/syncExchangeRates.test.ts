import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./syncExchangeRates.ts", import.meta.url), "utf8");

test("carga el .env raíz aunque npm ejecute el script desde el workspace", () => {
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(source, /"\.\.\/\.\.\/\.\.\/\.\."/);
  assert.match(source, /dotenv\.config\(\{ path: path\.join\(repositoryRoot, "\.env"\) \}\)/);
  assert.doesNotMatch(source, /import "dotenv\/config"/);
});
