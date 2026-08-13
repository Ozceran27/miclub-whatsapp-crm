import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_CAPABILITIES, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, type ClubCapability } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";
import { canRunDataMigration, resolveClubCapabilities } from "./clubCapabilityService.js";

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
