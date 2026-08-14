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
  assert.match(sql, /when 'CMV' then 'OPERATIONAL'/);
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
