import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FUTURE_ROLE_DEFAULT_PERMISSIONS,
  KNOWN_PERMISSIONS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  SECTOR_OPERATOR_PERMISSIONS,
} from "@miclub/shared";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("el inventario estático de rutas no contiene permisos huérfanos", async () => {
  const routeDir = path.join(apiRoot, "src/routes");
  const files = (await readdir(routeDir)).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
  const permissionConstants = PERMISSIONS as Record<string, string>;
  const grantsByRole = ROLE_PERMISSION_MATRIX.filter(({ role }) => ["owner", "DIRECTOR", "admin"].includes(role)).map(({ role, permissions }) => ({ role, granted: new Set<string>(permissions) }));
  let requirements = 0;
  for (const file of files) {
    const source = await readFile(path.join(routeDir, file), "utf8");
    for (const match of source.matchAll(/requirePermission\(\s*PERMISSIONS\.([A-Z_]+)/g)) {
      requirements += 1;
      const permission = permissionConstants[match[1]];
      assert.ok(permission, `${file} referencia la constante de permiso desconocida ${match[1]}`);
      for (const { role, granted } of grantsByRole) {
        assert.ok(granted.has(permission), `${file} exige ${permission}, pero ${role} no lo recibe`);
      }
    }
  }
  assert.ok(requirements > 0, "el inventario debe encontrar rutas protegidas");
});

test("operadores sectoriales y roles futuros siguen una política de privilegio mínimo", () => {
  assert.ok(SECTOR_OPERATOR_PERMISSIONS.length > 0);
  assert.ok(!SECTOR_OPERATOR_PERMISSIONS.includes(PERMISSIONS.SECTORS_ANY as never));
  assert.ok(!SECTOR_OPERATOR_PERMISSIONS.includes(PERMISSIONS.ADMINISTRATION_CONFIGURE as never));
  assert.deepEqual(FUTURE_ROLE_DEFAULT_PERMISSIONS, []);
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
  assert.deepEqual(ROLE_PERMISSION_MATRIX.find(({ role }) => role === "owner")?.permissions, ROLE_DEFAULT_PERMISSIONS.owner);
  assert.match(manualSql, /UPDATE miclub\.user_club_memberships AS membership\s+SET permissions/s);
  assert.doesNotMatch(manualSql, /CREATE TEMP TABLE approved_memberships/);
  assert.match(manualSql, /array_cat\([\s\S]+ARRAY\['onboarding\.read', 'onboarding\.write'\]::text\[\]/);
  assert.match(manualSql, /lower\(role\.code\) IN \('owner', 'admin', 'director'\)/);
});
