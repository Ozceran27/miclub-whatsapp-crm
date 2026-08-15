import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hasOpenTransaction, migrationManifest, renderPostAdminMigrationTable, validateMigrationGraph } from "./migrationManifest.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("el checkpoint post-admin se genera desde las entradas correspondientes del manifiesto", async () => {
  const checkpoint = await readFile(path.join(repositoryRoot, "docs/checkpoint-post-admin.md"), "utf8");
  const startMarker = "<!-- POST_ADMIN_MIGRATIONS:START -->";
  const endMarker = "<!-- POST_ADMIN_MIGRATIONS:END -->";
  const start = checkpoint.indexOf(startMarker);
  const end = checkpoint.indexOf(endMarker);
  assert.notEqual(start, -1, `falta ${startMarker}`);
  assert.ok(end > start, `falta ${endMarker}`);
  const documentedTable = checkpoint.slice(start + startMarker.length, end).trim();

  assert.equal(documentedTable, renderPostAdminMigrationTable());
});

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
    assert.equal(hasOpenTransaction(sql), false, `transacción abierta en ${migration.path}`);
  }
});

test("el grafo no tiene nombres, timestamps ni dependencias imposibles", () => {
  assert.deepEqual(validateMigrationGraph(migrationManifest), []);
});

test("el grafo rechaza una dependencia futura y timestamps nuevos repetidos", () => {
  const invalid = [
    { path: "209901010001_consumer.sql", sha256: "x", dependsOn: ["209901010002_provider.sql"], requires: ["miclub.table.future"] },
    { path: "209901010002_provider.sql", sha256: "y", provides: ["miclub.table.future"] },
    { path: "nested/209901010002_duplicate.sql", sha256: "z" },
  ];
  assert.deepEqual(validateMigrationGraph(invalid), [
    "Timestamp repetido: 209901010002",
    "Dependencia imposible: 209901010001_consumer.sql -> 209901010002_provider.sql",
    "Objeto usado antes de crearse: 209901010001_consumer.sql -> miclub.table.future",
  ]);
  assert.equal(hasOpenTransaction("BEGIN; select 1"), true);
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

test("la provisión administrativa es append-only, acotada e idempotente", async () => {
  const migrationPath = "202608060006_provision_administrative_permissions.sql";
  assert.ok(migrationManifest.some(({ path: registeredPath }) => registeredPath === migrationPath));
  const sql = await readFile(path.join(migrationsDir, migrationPath), "utf8");

  assert.match(sql, /membership\.status = 'active'/);
  assert.match(sql, /role\.code IN \('owner', 'DIRECTOR', 'admin'\)/);
  assert.match(sql, /coalesce\(membership\.permissions, '\{\}'::text\[\]\) \|\|/);
  assert.match(sql, /AND EXISTS \(\s*SELECT permission FROM canonical\s*EXCEPT/s);
  assert.match(sql, /session_revoked_before = now\(\)/);
  assert.doesNotMatch(sql, /lower\(role\.code\)/);
});

test("el backfill granular preserva grants personalizados y renueva sesiones", async () => {
  const migrationPath = "202608060007_backfill_granular_mutation_permissions.sql";
  assert.equal(migrationManifest.filter(({ path: entryPath }) => entryPath === migrationPath).length, 1);
  const sql = await readFile(path.join(migrationsDir, migrationPath), "utf8");
  for (const permission of ["movements.edit", "movements.cancel", "enrollments.create", "enrollments.edit", "enrollments.cancel"]) {
    assert.match(sql, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(sql, /coalesce\(membership\.permissions, '\{\}'::text\[\]\)/);
  assert.match(sql, /membership\.status = 'active'/);
  assert.match(sql, /session_revoked_before = now\(\)/);
  assert.doesNotMatch(sql, /role\.code/);
});


test("la migración XLSX referencia la tabla canónica de usuarios", async () => {
  const migrationPath = "202608130004_secure_xlsx_import.sql";
  const sql = await readFile(path.join(migrationsDir, migrationPath), "utf8");

  assert.match(sql, /references miclub\.users\(id\) on delete set null/i);
  assert.doesNotMatch(sql, /references miclub\.app_users/i);
  assert.match(sql, /to_regclass\('miclub\.users'\)/i);
  assert.match(sql, /begin;[\s\S]*commit;/i);
});

test("las referencias de actividades se resuelven declarativamente dentro del tenant", async () => {
  const migrationPath = "202608150002_scope_activity_catalog_fks.sql";
  const sql = await readFile(path.join(migrationsDir, migrationPath), "utf8");

  for (const parent of ["sectors", "instructors", "people"]) {
    assert.match(sql, new RegExp(`ALTER TABLE miclub\\.${parent}[\\s\\S]*UNIQUE \\(id, club_id\\)`));
  }
  assert.match(sql, /FOREIGN KEY \(sector_id, club_id\)[\s\S]*REFERENCES miclub\.sectors \(id, club_id\) ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(instructor_id, club_id\)[\s\S]*REFERENCES miclub\.instructors \(id, club_id\) ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(manager_person_id, club_id\)[\s\S]*REFERENCES miclub\.people \(id, club_id\) ON DELETE RESTRICT/);
  assert.match(sql, /ON miclub\.activities \(sector_id, club_id\)/);
  assert.match(sql, /ON miclub\.activities \(instructor_id, club_id\)/);
  assert.match(sql, /ON miclub\.activities \(manager_person_id, club_id\)/);
  assert.match(sql, /DROP TRIGGER IF EXISTS activities_validate_tenant/);
  assert.doesNotMatch(sql, /CREATE TRIGGER activities_validate_tenant/);
});

test("el guard de actividades no convierte etiquetas inglesas al enum entity_status", async () => {
  const migrationPath = "202608150003_fix_activity_status_enum_guard.sql";
  const sql = await readFile(path.join(migrationsDir, migrationPath), "utf8");

  assert.match(sql, /NEW\.status::text IN \('active', 'activa'\)/);
  assert.match(sql, /NEW\.status::text NOT IN \('archived', 'cancelada'\)/);
  assert.doesNotMatch(sql, /NEW\.status IN \('active', 'activa'\)/);
});

test("la regresión SQL reconoce el SQLSTATE específico de ON DELETE RESTRICT", async () => {
  const sql = await readFile(path.resolve(migrationsDir, "../tests/activity_catalog_tenant_fkeys.sql"), "utf8");

  assert.equal(
    sql.match(/EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN/g)?.length,
    3,
  );
});
