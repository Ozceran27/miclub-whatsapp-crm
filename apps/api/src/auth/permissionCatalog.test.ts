import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("toda ruta protegida declara un permiso del catálogo central", async () => {
  const routeDir = path.join(apiRoot, "src/routes");
  const files = (await readdir(routeDir)).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
  const declared = new Set<string>(KNOWN_PERMISSIONS);
  for (const file of files) {
    const source = await readFile(path.join(routeDir, file), "utf8");
    for (const match of source.matchAll(/requirePermission\(\s*["']([^"']+)["']/g)) {
      assert.ok(declared.has(match[1]), `${file} exige el permiso no declarado ${match[1]}`);
    }
  }
});

test("las migraciones y el SQL manual no introducen permisos fuera del catálogo", async () => {
  const migrationDir = path.join(apiRoot, "db/migrations");
  const files = (await readdir(migrationDir)).filter((name) => name >= "202607250008" && name.endsWith(".sql"));
  const declared = new Set<string>(KNOWN_PERMISSIONS);
  for (const file of files) {
    const sql = await readFile(path.join(migrationDir, file), "utf8");
    for (const match of sql.matchAll(/'([a-z]+(?:[.:][a-z]+)+)'/g)) {
      if (match[1].includes(":" ) || match[1].includes(".")) {
        assert.ok(declared.has(match[1]), `${file} contiene el permiso no declarado ${match[1]}`);
      }
    }
  }

  const manualSql = await readFile(path.join(apiRoot, "db/stabilization/owner_permissions_manual.sql"), "utf8");
  const marker = manualSql.match(/^-- canonical-owner-permissions: (.+)$/m);
  assert.ok(marker, "el SQL manual debe publicar su matriz canónica");
  assert.deepEqual(JSON.parse(marker[1]), [...ROLE_DEFAULT_PERMISSIONS.owner]);
});
