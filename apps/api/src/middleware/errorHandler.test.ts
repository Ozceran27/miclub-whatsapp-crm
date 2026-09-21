import assert from "node:assert/strict";
import test from "node:test";
import { errorHandler } from "./errorHandler.js";

test("registra metadatos seguros de PostgreSQL sin exponer detalle ni parámetros", () => {
  const original = console.error;
  const logged: unknown[] = [];
  console.error = (...values: unknown[]) => { logged.push(...values); };
  let status = 0;
  let body: unknown;
  const response = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  };
  try {
    const error = Object.assign(new Error("insert contains private data"), {
      code: "23503",
      constraint: "activities_updated_by_fkey",
      table: "activities",
      detail: "Key contains a personal UUID",
    });
    errorHandler(error, { requestId: "request-1" } as never, response as never, (() => undefined) as never);
  } finally {
    console.error = original;
  }

  assert.equal(status, 500);
  assert.deepEqual(body, {
    ok: false, error: true, message: "Error interno del servidor.", status: 500,
    code: "23503", batchId: undefined, details: undefined, retryable: true, requestId: "request-1",
  });
  assert.deepEqual(logged, [{ requestId: "request-1", status: 500, code: "23503",
    constraint: "activities_updated_by_fkey", table: "activities", column: undefined }]);
  assert.equal(JSON.stringify(logged).includes("personal UUID"), false);
});

