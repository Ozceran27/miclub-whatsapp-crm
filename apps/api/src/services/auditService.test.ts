import assert from "node:assert/strict";
import test from "node:test";
import { auditService, sanitizeAuditData } from "./auditService.js";
import { setPostgresPoolForTests, type PgPool } from "../db/postgres.js";

test("sanitizeAuditData elimina secretos incluso en objetos anidados", () => {
  assert.deepEqual(sanitizeAuditData({
    email: "socio@example.com",
    password: "no-guardar",
    nested: { accessToken: "no-guardar", amount: 1250 },
    headers: { authorization: "Bearer no-guardar", requestId: "req-1" },
  }), {
    email: "socio@example.com",
    nested: { amount: 1250 },
    headers: { requestId: "req-1" },
  });
});

test("auditService persiste contexto seguro y normaliza la IP", async () => {
  let capturedParams: unknown[] = [];
  const executor = {
    query: async <T>(_sql: string, params?: unknown[]) => {
      capturedParams = params ?? [];
      return { rows: [{ id: "audit-id" }] as T[] };
    },
  };

  const id = await auditService.login({
    action: "auth.login",
    result: "failure",
    ip: "203.0.113.8:4567, 10.0.0.1",
    requestId: "req-123",
    metadata: { reason: "invalid_credentials", token: "no-guardar", eventType: "movement" },
    newData: { email: "socio@example.com", passwordHash: "no-guardar" },
  }, executor);

  assert.equal(id, "audit-id");
  assert.equal(capturedParams[8], "203.0.113.8");
  assert.equal(capturedParams[10], "req-123");
  assert.deepEqual(JSON.parse(String(capturedParams[7])), { email: "socio@example.com" });
  assert.deepEqual(JSON.parse(String(capturedParams[12])), {
    eventType: "login",
    reason: "invalid_credentials",
  });
  assert.equal(capturedParams.join(" ").includes("no-guardar"), false);
});

test("auditService vincula app.club_id al auditar fuera de una transacción", async (t) => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async <T>(sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      return { rows: sql.includes("INSERT INTO miclub.audit_log") ? [{ id: "audit-id" }] as T[] : [] as T[] };
    },
    release: () => undefined,
  };
  const pool = { ...client, connect: async () => client, end: async () => undefined } as PgPool;
  setPostgresPoolForTests(pool);
  t.after(() => setPostgresPoolForTests(undefined));

  await auditService.login({
    action: "auth.login",
    result: "success",
    userId: "11111111-1111-4111-8111-111111111111",
    clubId: "22222222-2222-4222-8222-222222222222",
    membershipId: "33333333-3333-4333-8333-333333333333",
  });

  assert.deepEqual(statements.map(({ sql, params }) => ({ sql: sql.trim().split("\n")[0], params })), [
    { sql: "BEGIN", params: [] },
    { sql: "SELECT set_config('app.club_id', $1, true)", params: ["22222222-2222-4222-8222-222222222222"] },
    { sql: "SELECT set_config('app.current_club_id', $1, true)", params: ["22222222-2222-4222-8222-222222222222"] },
    { sql: "INSERT INTO miclub.audit_log (", params: statements[3].params },
    { sql: "COMMIT", params: [] },
  ]);
});
