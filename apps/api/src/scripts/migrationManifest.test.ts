import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationManifest } from "./migrationManifest.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

test("el manifiesto incluye exactamente una vez cada SQL versionado y conserva sus checksums", async () => {
  const versionedSql = [
    ...(await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")),
    ...(await readdir(path.join(migrationsDir, "multitenant")))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => `multitenant/${name}`),
  ].sort();
  const manifestedSql = migrationManifest.map(({ path: migrationPath }) => migrationPath);

  assert.deepEqual([...manifestedSql].sort(), versionedSql);
  assert.equal(new Set(manifestedSql).size, manifestedSql.length, "hay rutas repetidas");
  assert.equal(
    new Set(manifestedSql.map((migrationPath) => path.basename(migrationPath))).size,
    manifestedSql.length,
    "hay nombres repetidos que colisionarían en public.miclub_schema_migrations",
  );

  for (const migration of migrationManifest) {
    const sql = await readFile(path.join(migrationsDir, migration.path), "utf8");
    assert.equal(createHash("sha256").update(sql).digest("hex"), migration.sha256, migration.path);
  }
});

test("las fases multitenant preceden a sus vistas y repositorios dependientes", () => {
  const order = migrationManifest.map(({ path: migrationPath }) => migrationPath);
  const before = (dependency: string, dependent: string) => {
    assert.ok(order.indexOf(dependency) < order.indexOf(dependent), `${dependency} debe preceder a ${dependent}`);
  };

  before("multitenant/202607240001_create_clubs.sql", "202607250003_create_user_club_authorization.sql");
  before("multitenant/202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql", "multitenant/202607250004_scope_operational_views_by_club.sql");
  before("multitenant/202607250001_backfill_and_scope_unique_constraints.sql", "multitenant/202607250004_scope_operational_views_by_club.sql");
  before("202607250002_evolve_app_users_auth.sql", "multitenant/202607250006_scope_people_and_link_global_users.sql");
  before("multitenant/202607250004_scope_operational_views_by_club.sql", "202607250010_align_import_conflict_targets.sql");
});
