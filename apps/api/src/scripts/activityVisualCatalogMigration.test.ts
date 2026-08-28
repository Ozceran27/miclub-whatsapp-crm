import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIVITY_VISUAL_CATALOG } from "@miclub/shared";

const migration = new URL("../../db/migrations/202608280002_sync_activity_visual_catalog.sql", import.meta.url);

test("la migración inserta exactamente todas las claves del catálogo visual compartido", async () => {
  const sql = await readFile(migration, "utf8");
  const insert = sql.match(/insert into miclub\.activity_icon_catalog[\s\S]*?values([\s\S]*?)on conflict \(icon_key\)/i);
  assert.ok(insert);
  const keys = [...insert[1].matchAll(/^ \('([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(keys, ACTIVITY_VISUAL_CATALOG.map(item => item.key));
  assert.equal(new Set(keys).size, keys.length);
});

test("la migración canoniza soccer como football sin romper referencias históricas", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /\('soccer','football'\)/);
  assert.match(sql, /update miclub\.activities set icon_key='football' where icon_key='soccer'/i);
  assert.match(sql, /where icon_key not in/i);
});
