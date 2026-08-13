import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests, type PgClient, type PgPool } from "../db/postgres.js";
import { archiveSector, updateSector, type SectorActor } from "./sectorsRepository.js";

const actor: SectorActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  membershipId: "22222222-2222-4222-8222-222222222222",
  clubId: "33333333-3333-4333-8333-333333333333",
};
const updatedAt = "2026-08-05T12:00:00.000Z";

const fakePool = (handler: (sql: string, params?: unknown[]) => { rows: Record<string, unknown>[] }) => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      return handler(sql, params);
    },
    release: () => undefined,
  } as PgClient;
  const pool = { connect: async () => client, query: client.query, end: async () => undefined } as PgPool;
  setPostgresPoolForTests(pool);
  return queries;
};

test.afterEach(() => setPostgresPoolForTests(undefined));

test("updateSector aplica tenant, concurrencia y audit before/after en la misma transacción", async () => {
  const before = { id: "44444444-4444-4444-8444-444444444444", club_id: actor.clubId, name: "FITNESS", is_system: false, updated_at: updatedAt };
  const after = { ...before, name: "FITNESS PLUS", updated_at: "2026-08-05T12:01:00.000Z" };
  const queries = fakePool((sql) => {
    if (sql.includes("from miclub.sectors")) return { rows: [before] };
    if (sql.includes("update miclub.sectors")) return { rows: [after] };
    if (sql.includes("INSERT INTO miclub.audit_log")) return { rows: [{ id: "audit-1" }] };
    throw new Error(`SQL inesperado: ${sql}`);
  });

  const result = await updateSector(actor, before.id, updatedAt, { name: "FITNESS PLUS" });
  assert.deepEqual(result, { kind: "updated", sector: after });
  assert.deepEqual(queries.find(({ sql }) => sql.includes("from miclub.sectors"))?.params, [actor.clubId, before.id]);
  const audit = queries.find(({ sql }) => sql.includes("INSERT INTO miclub.audit_log"));
  assert.ok(audit);
  assert.equal(JSON.parse(String(audit.params?.[6])).name, "FITNESS");
  assert.equal(JSON.parse(String(audit.params?.[7])).name, "FITNESS PLUS");
});

test("updateSector rechaza un updated_at obsoleto sin escribir ni auditar", async () => {
  const before = { id: "44444444-4444-4444-8444-444444444444", name: "FITNESS", is_system: false, updated_at: updatedAt };
  const queries = fakePool((sql) => {
    if (sql.includes("from miclub.sectors")) return { rows: [before] };
    throw new Error(`No debía ejecutar: ${sql}`);
  });
  assert.deepEqual(await updateSector(actor, before.id, "2026-08-05T11:00:00.000Z", { name: "Otro" }), { kind: "conflict" });
  assert.equal(queries.some(({ sql }) => sql.includes("update miclub.sectors") || sql.includes("audit_log")), false);
});

test("archiveSector no protege nombres: depende exclusivamente de is_system", async () => {
  const before = { id: "44444444-4444-4444-8444-444444444444", name: "TESORERÍA", is_system: false, updated_at: updatedAt };
  const after = { ...before, status: "archived", updated_at: "2026-08-05T12:01:00.000Z" };
  fakePool((sql) => {
    if (sql.includes("from miclub.sectors")) return { rows: [before] };
    if (sql.includes("update miclub.sectors")) return { rows: [after] };
    if (sql.includes("INSERT INTO miclub.audit_log")) return { rows: [{ id: "audit-1" }] };
    throw new Error(`SQL inesperado: ${sql}`);
  });
  assert.deepEqual(await archiveSector(actor, before.id, updatedAt), { kind: "updated", sector: after });
});

test("archiveSector protege un sector de sistema aunque su nombre no sea reservado", async () => {
  const before = { id: "44444444-4444-4444-8444-444444444444", name: "CONFIGURACIÓN INTERNA", is_system: true, updated_at: updatedAt };
  const queries = fakePool((sql) => {
    if (sql.includes("from miclub.sectors")) return { rows: [before] };
    throw new Error(`No debía ejecutar: ${sql}`);
  });
  assert.deepEqual(await archiveSector(actor, before.id, updatedAt), { kind: "protected" });
  assert.equal(queries.some(({ sql }) => sql.includes("update miclub.sectors") || sql.includes("audit_log")), false);
});

test("archiveSector conserva historial archivando aunque existan referencias", async () => {
  const before = { id: "44444444-4444-4444-8444-444444444444", name: "SALÓN", is_system: false, updated_at: updatedAt };
  const after = { ...before, status: "archived", updated_at: "2026-08-05T12:01:00.000Z" };
  const queries = fakePool((sql) => {
    if (sql.includes("from miclub.sectors")) return { rows: [before] };
    if (sql.includes("update miclub.sectors")) return { rows: [after] };
    if (sql.includes("INSERT INTO miclub.audit_log")) return { rows: [{ id: "audit-1" }] };
    throw new Error(`SQL inesperado: ${sql}`);
  });
  assert.deepEqual(await archiveSector(actor, before.id, updatedAt), { kind: "updated", sector: after });
  assert.equal(queries.some(({ sql }) => sql.includes("delete from")), false);
});
