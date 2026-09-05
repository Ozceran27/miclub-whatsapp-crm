import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations/202608140004_correct_category_catalog.sql");

test("el catálogo correctivo fija exactamente códigos y clasificaciones sensibles", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const expected = [
    "INSCRIPCION","CUOTA","TURNOS","COMISION","ALQUILER","EVENTOS","VENTAS","CLASES","CURSOS","KIOSCO","BEBIDAS",
    "PUBLICIDAD","SALARIOS","MANTENIMIENTO","DEPOSITOS","EXTRACCIONES","DOLARES","REPARACIONES","VIATICOS","GANANCIA",
    "PERDIDA","CMV","SEGUROS","LIMPIEZA","LIBRERIA","OTROS","IMPUESTOS","LUZ","AGUA","INTERNET","DEUDAS","SERVICIOS","CAPITAL_INICIAL",
  ];
  const assertion = sql.match(/if actual_codes <> array\[([\s\S]*?)\]::text\[]/);
  assert.ok(assertion);
  assert.deepEqual([...assertion[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]), expected);
  assert.equal(new Set(expected).size, expected.length, "no puede haber códigos duplicados");
  assert.match(sql, /when 'SALARIOS' then 'OPERATIONAL'/);
  assert.match(sql, /when 'DEUDAS' then 'LIABILITY'/);
});

test("aliases convergen y las altas no pueden producir doble conteo", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /\('MANTENIM\.', 'MANTENIMIENTO'\)/);
  assert.match(sql, /\('DEUDA', 'DEUDAS'\)/);
  assert.match(sql, /\('DEUDAS', 'DEUDAS'\)/);
  assert.match(sql, /normalized_alias text primary key/);
  assert.match(sql, /catalog_id uuid not null references miclub\.category_catalog/);
  assert.match(sql, /before insert on miclub\.movement_categories/);
  assert.match(sql, /where mc\.catalog_id is null/);
  assert.doesNotMatch(sql, /insert into miclub\.movement_categories/);
});

const productMigrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations/202608210003_complete_product_category_catalog.sql");

test("el manifiesto activo coincide exactamente con el catálogo de producto y cubre todas las clasificaciones", async () => {
  const { ACTIVE_MOVEMENT_CATEGORY_CODES, MOVEMENT_CATEGORY_CATALOG, MOVEMENT_CATEGORY_CLASSIFICATIONS } = await import("../../../../packages/shared/src/movementCategoryCatalog.js");
  const sql = await readFile(productMigrationPath, "utf8");
  const catalogInsert = sql.match(/insert into miclub\.category_catalog[\s\S]*?values([\s\S]*?)on conflict \(code\)/i);
  assert.ok(catalogInsert);
  const rows = [...catalogInsert[1].matchAll(/\('([A-Z0-9_]+)','[^']*','(OPERATIONAL|NON_OPERATIONAL|TAX|SERVICE|LIABILITY)',true,(\d+)\)/g)]
    .map((match) => ({ code: match[1], classification: match[2], order: Number(match[3]) }));
  assert.deepEqual(rows.map(({ code }) => code), ACTIVE_MOVEMENT_CATEGORY_CODES);
  const effectiveClassifications = rows.map(({ code, classification }) => code === "CMV" ? "NON_OPERATIONAL" : classification);
  assert.deepEqual(effectiveClassifications, MOVEMENT_CATEGORY_CATALOG.map(([, , classification]) => classification));
  assert.deepEqual([...new Set(rows.map(({ classification }) => classification))].sort(), [...MOVEMENT_CATEGORY_CLASSIFICATIONS].sort());
  assert.deepEqual(rows.map(({ order }) => order), rows.map((_, index) => (index + 1) * 10));
  assert.match(sql, /set display_order = display_order \* 1000, is_active = false/);
  assert.match(sql, /add column if not exists direction miclub\.movement_type/);
  assert.ok(sql.indexOf("add column if not exists direction") < sql.indexOf("insert into miclub.movement_categories"));
  assert.doesNotMatch(sql, /delete from miclub\.(?:category_catalog|movement_categories)/i);
});

test("CMV queda excluido de operación e incluido sólo como egreso no operativo", async () => {
  const { MOVEMENT_CATEGORY_CATALOG } = await import("../../../../packages/shared/src/movementCategoryCatalog.js");
  const { NON_OPERATING_EXPENSE_CATEGORIES, OPERATING_CATEGORIES } = await import("../services/economyDomain.js");
  const cmv = MOVEMENT_CATEGORY_CATALOG.find(([code]) => code === "CMV");

  assert.deepEqual(cmv, ["CMV", "CMV", "NON_OPERATIONAL", "EGRESOS"]);
  assert.equal((OPERATING_CATEGORIES as readonly string[]).includes("CMV"), false);
  assert.equal((NON_OPERATING_EXPENSE_CATEGORIES as readonly string[]).includes("CMV"), true);
});

const cmvForwardMigrationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations/202609050003_classify_cmv_as_non_operational.sql");

test("la migración forward corrige catálogo y categorías tenant sin tocar movimientos", async () => {
  const sql = await readFile(cmvForwardMigrationPath, "utf8");
  assert.match(sql, /update miclub\.category_catalog[\s\S]*classification = 'NON_OPERATIONAL'[\s\S]*code = 'CMV'/);
  assert.match(sql, /mc\.catalog_id = cmv_catalog\.id/);
  assert.match(sql, /mc\.catalog_id is null[\s\S]*trim\(mc\.name\)[\s\S]*= 'CMV'/);
  assert.match(sql, /information_schema\.columns[\s\S]*column_name = 'code'[\s\S]*execute \$cmv_code\$[\s\S]*coalesce\(mc\.code/);
  assert.match(sql, /direction = 'EGRESOS'::miclub\.movement_type/);
  assert.doesNotMatch(sql, /(?:update|delete from|insert into) miclub\.movements\b/i);
});
