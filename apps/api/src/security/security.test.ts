import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { csrfProtection, getAllowedOrigins, requestId } from "./index.js";

test("getAllowedOrigins combina PUBLIC_APP_URL y CORS_ORIGINS normalizados", () => {
  const previousPublicUrl = process.env.PUBLIC_APP_URL;
  const previousCorsOrigins = process.env.CORS_ORIGINS;
  process.env.PUBLIC_APP_URL = "https://app.example.com/path";
  process.env.CORS_ORIGINS = "https://admin.example.com, http://localhost:5173";
  try {
    assert.deepEqual([...getAllowedOrigins()], [
      "https://app.example.com",
      "https://admin.example.com",
      "http://localhost:5173"
    ]);
  } finally {
    if (previousPublicUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousPublicUrl;
    if (previousCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousCorsOrigins;
  }
});

test("requestId conserva identificadores válidos y descarta valores inseguros", () => {
  const headers = new Map<string, string>();
  const response = { set: (name: string, value: string) => { headers.set(name, value); } } as unknown as Response;
  const validRequest = { get: () => "trace-123" } as unknown as Request;
  requestId(validRequest, response, (() => undefined) as NextFunction);
  assert.equal(validRequest.requestId, "trace-123");
  assert.equal(headers.get("X-Request-Id"), "trace-123");

  const invalidRequest = { get: () => "invalid id with spaces" } as unknown as Request;
  requestId(invalidRequest, response, (() => undefined) as NextFunction);
  assert.match(invalidRequest.requestId!, /^[0-9a-f-]{36}$/);
});

test("CSRF bloquea mutaciones con cookie de sesión sin un Origin permitido", () => {
  let status = 0;
  let payload: unknown;
  let nextCalled = false;
  const response = {
    status(code: number) { status = code; return this; },
    json(body: unknown) { payload = body; return this; }
  } as unknown as Response;
  const request = {
    method: "POST",
    headers: { cookie: "miclub_session=signed" },
    get: () => undefined,
    requestId: "request-1"
  } as unknown as Request;

  csrfProtection(new Set(["https://app.example.com"]))(request, response, () => { nextCalled = true; });
  assert.equal(status, 403);
  assert.equal(nextCalled, false);
  assert.deepEqual(payload, { error: true, message: "Origen no permitido por la política CSRF.", requestId: "request-1" });
});

test("CSRF permite una mutación con cookie desde el Origin configurado", () => {
  let nextCalled = false;
  const request = {
    method: "PATCH",
    headers: { cookie: "miclub_session=signed" },
    get: (name: string) => name === "origin" ? "https://app.example.com" : undefined
  } as unknown as Request;
  csrfProtection(new Set(["https://app.example.com"]))(request, {} as Response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("CSRF permite siempre logout para que el servidor pueda destruir la sesión", () => {
  let nextCalled = false;
  const request = {
    method: "POST",
    path: "/auth/logout",
    headers: { cookie: "miclub_session=signed" },
    get: () => undefined
  } as unknown as Request;
  csrfProtection(new Set())(request, {} as Response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
