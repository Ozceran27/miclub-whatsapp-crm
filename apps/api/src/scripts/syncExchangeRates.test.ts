import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./syncExchangeRates.ts", import.meta.url), "utf8");

test("carga el .env raíz aunque npm ejecute el script desde el workspace", () => {
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(source, /"\.\.\/\.\.\/\.\.\/\.\."/);
  assert.match(source, /dotenv\.config\(\{ path: path\.join\(repositoryRoot, "\.env"\), quiet: true \}\)/);
  assert.doesNotMatch(source, /import "dotenv\/config"/);
});

test("resuelve todos los proveedores antes de abrir la base y usa los tres pares predeterminados", () => {
  assert.match(source, /"USD\/ARS,USD\/BRL,USD\/EUR"/);
  const jobs = source.indexOf("const jobs = pairs.map");
  const pool = source.indexOf("const adminPool = await getPostgresAdminPool");
  assert.ok(jobs >= 0 && pool > jobs);
  assert.match(source, /resolveOfficialExchangeRateProvider/);
});
