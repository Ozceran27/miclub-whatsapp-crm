import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIVITY_VISUAL_CATALOG } from "@miclub/shared";

const migrations = [
  new URL("../../db/migrations/202608280002_sync_activity_visual_catalog.sql", import.meta.url),
  new URL("../../db/migrations/202609010001_expand_activity_visual_catalog.sql", import.meta.url),
];

test("la migración inserta exactamente todas las claves del catálogo visual compartido", async () => {
  const sql = (await Promise.all(migrations.map(path => readFile(path, "utf8")))).join("\n");
  const keys = [...sql.matchAll(/\('([^']+)'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*\d+\s*,\s*true\)/g)].map(match => match[1]);
  assert.deepEqual(keys, ACTIVITY_VISUAL_CATALOG.map(item => item.key));
  assert.equal(new Set(keys).size, keys.length);
});

test("la migración canoniza soccer como football sin romper referencias históricas", async () => {
  const sql = await readFile(migrations[0], "utf8");
  assert.match(sql, /\('soccer','football'\)/);
  assert.match(sql, /update miclub\.activities set icon_key='football' where icon_key='soccer'/i);
  assert.match(sql, /where icon_key not in/i);
});
