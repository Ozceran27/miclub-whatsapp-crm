import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { requireAuth, requireMembership, requirePermission, requireRole, requireSectorAccess, rejectClientClubId } from "./authorization.js";
import type { RequestAuthContext } from "../auth/types.js";

const auth: RequestAuthContext = {
  userId: "user-1", email: "admin@club.test", legacy: false,
  clubId: "club-1", membershipId: "membership-1", role: "admin",
  permissions: ["people:read"], sectorIds: ["sector-1"]
};

const request = (middleware: express.RequestHandler, overrides: Record<string, unknown> = {}) => new Promise<{ status: number; next: boolean }>((resolve) => {
  const req = { auth, params: {}, query: {}, body: {}, ...overrides } as unknown as express.Request;
  let statusCode = 200;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json() { resolve({ status: statusCode, next: false }); return response; }
  } as unknown as express.Response;
  middleware(req, response, () => resolve({ status: 200, next: true }));
});

test("los guards autorizan únicamente el contexto tenant de la sesión", async () => {
  assert.deepEqual(await request(requireAuth), { status: 200, next: true });
  assert.deepEqual(await request(requireMembership), { status: 200, next: true });
  assert.deepEqual(await request(requirePermission("people:read")), { status: 200, next: true });
  assert.deepEqual(await request(requirePermission("people:write")), { status: 403, next: false });
  assert.deepEqual(await request(requireRole("admin")), { status: 200, next: true });
  assert.deepEqual(await request(requireRole("viewer")), { status: 403, next: false });
  assert.deepEqual(await request(requireSectorAccess(), { params: { sectorId: "sector-1" } }), { status: 200, next: true });
  assert.deepEqual(await request(requireSectorAccess(), { params: { sectorId: "sector-2" } }), { status: 403, next: false });
});

test("clubId nunca se acepta desde el frontend", async () => {
  assert.deepEqual(await request(rejectClientClubId, { query: { clubId: "otro-club" } }), { status: 400, next: false });
  assert.deepEqual(await request(rejectClientClubId), { status: 200, next: true });
});
