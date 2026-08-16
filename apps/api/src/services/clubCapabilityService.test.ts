import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_CAPABILITIES, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, type ClubCapability } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";
import { canRunDataMigration, hasFeature, resolveClubCapabilities } from "./clubCapabilityService.js";

const grant: ClubCapability = {
  code: CLUB_CAPABILITIES.DATA_MIGRATION,
  source: "manual_rollout",
  effectiveFrom: "2026-08-13T00:00:00.000Z",
  effectiveUntil: null,
  actor: "ops@miclub.test",
};

test("resuelve sólo grants vigentes con metadatos tenant-scoped", async () => {
  let params: unknown[] | undefined;
  const executor: QueryExecutor = { query: <T>(_sql: string, values?: unknown[]) => {
    params = values;
    return Promise.resolve({ rows: [{ capability: grant.code, source: grant.source, effective_from: grant.effectiveFrom, effective_until: null, actor: grant.actor }] as T[] });
  } };
  assert.deepEqual(await resolveClubCapabilities("club-1", executor, new Date("2026-08-13T12:00:00Z")), [grant]);
  assert.equal(params?.[0], "club-1");
});

test("permiso sin capability es denegado", () => assert.equal(canRunDataMigration([PERMISSIONS.IMPORTS_RUN], []), false));
test("capability sin permiso es denegada", () => assert.equal(canRunDataMigration([], [grant]), false));
test("Director con permiso y capability es autorizado", () => assert.equal(canRunDataMigration(ROLE_DEFAULT_PERMISSIONS.DIRECTOR, [grant]), true));
test("trabajador e instructor son denegados aun con capability", () => {
  assert.equal(canRunDataMigration(ROLE_DEFAULT_PERMISSIONS.TRABAJADOR, [grant]), false);
  assert.equal(canRunDataMigration(ROLE_DEFAULT_PERMISSIONS.INSTRUCTOR, [grant]), false);
});

const featureExecutor = (enabled: boolean): QueryExecutor => ({
  query: <T>() => Promise.resolve({ rows: [{ enabled }] as T[] }),
});

test("rol permitido y feature ausente permanece denegado", async () => {
  assert.equal(ROLE_DEFAULT_PERMISSIONS.DIRECTOR.includes(PERMISSIONS.IMPORTS_RUN), true);
  assert.equal(await hasFeature("club-1", CLUB_CAPABILITIES.DATA_MIGRATION, featureExecutor(false)), false);
});

test("feature presente y rol denegado no mezcla feature con RBAC", async () => {
  assert.equal(await hasFeature("club-1", CLUB_CAPABILITIES.DATA_MIGRATION, featureExecutor(true)), true);
  assert.equal(canRunDataMigration(ROLE_DEFAULT_PERMISSIONS.TRABAJADOR, [grant]), false);
});

test("la consulta aplica expiración a suscripción y override", async () => {
  let sql = "";
  let params: unknown[] = [];
  const executor: QueryExecutor = { query: <T>(query: string, values?: unknown[]) => {
    sql = query; params = values ?? [];
    return Promise.resolve({ rows: [{ enabled: false }] as T[] });
  } };
  const now = new Date("2026-08-14T12:00:00Z");
  assert.equal(await hasFeature("club-1", CLUB_CAPABILITIES.DATA_MIGRATION, executor, now), false);
  assert.equal(params[2], now);
  assert.equal((sql.match(/effective_until is null or/g) ?? []).length, 2);
});

test("el override vigente prevalece sobre el entitlement", async () => {
  let sql = "";
  const executor: QueryExecutor = { query: <T>(query: string) => {
    sql = query;
    return Promise.resolve({ rows: [{ enabled: false }] as T[] });
  } };
  assert.equal(await hasFeature("club-1", CLUB_CAPABILITIES.DATA_MIGRATION, executor), false);
  assert.match(sql, /coalesce\(\(select enabled from current_override\),/);
});

test("la resolución de features usa suscripción y entitlement, nunca roles o permisos", async () => {
  let sql = "";
  const executor: QueryExecutor = { query: <T>(query: string) => {
    sql = query;
    return Promise.resolve({ rows: [{ enabled: true }] as T[] });
  } };

  assert.equal(await hasFeature("club-1", CLUB_CAPABILITIES.DATA_MIGRATION, executor), true);
  assert.match(sql, /club_subscriptions subscription/);
  assert.match(sql, /plan_entitlements entitlement/);
  assert.doesNotMatch(sql, /\broles\b|\bpermissions\b|user_club_memberships/);
});
