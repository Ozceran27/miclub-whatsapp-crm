import assert from "node:assert/strict";
import test from "node:test";
import { auditService, sanitizeAuditData } from "./auditService.js";

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
