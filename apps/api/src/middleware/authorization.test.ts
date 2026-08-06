import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { AUTHORIZATION_CAPABILITIES, PERMISSIONS } from "@miclub/shared";
import { isImportOperator, requireAuth, requireAuthorizationCapability, requireImportOperator, requireMembership, requirePermission, requireRole, requireSectorAccess, rejectClientClubId } from "./authorization.js";
import type { RequestAuthContext } from "../auth/types.js";

const auth: RequestAuthContext = {
  userId: "user-1", personId: "person-1", email: "admin@club.test", legacy: false,
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
  assert.deepEqual(await request(requirePermission("finance:write")), { status: 403, next: false });
  assert.deepEqual(await request(requireRole("admin")), { status: 200, next: true });
  assert.deepEqual(await request(requireRole("viewer")), { status: 403, next: false });
  assert.deepEqual(await request(requireSectorAccess(), { params: { sectorId: "sector-1" } }), { status: 200, next: true });
  assert.deepEqual(await request(requireSectorAccess(), { params: { sectorId: "sector-2" } }), { status: 403, next: false });
});

test("cada operación granular permite su permiso canónico o legacy y deniega permisos ajenos", async () => {
  for (const [capability, rule] of Object.entries(AUTHORIZATION_CAPABILITIES)) {
    const guard = requireAuthorizationCapability(capability as keyof typeof AUTHORIZATION_CAPABILITIES);
    assert.deepEqual(await request(guard, { auth: { ...auth, permissions: [rule.permission] } }), { status: 200, next: true }, `${capability}: canonical`);
    if ("legacyPermission" in rule) {
      assert.deepEqual(await request(guard, { auth: { ...auth, permissions: [rule.legacyPermission] } }), { status: 200, next: true }, `${capability}: legacy`);
    }
    assert.deepEqual(await request(guard, { auth: { ...auth, permissions: [PERMISSIONS.PEOPLE_READ] } }), { status: 403, next: false }, `${capability}: denied`);
  }
});

test("el guard de capacidad requiere autenticación", async () => {
  assert.deepEqual(await request(requireAuthorizationCapability("MOVEMENTS_EDIT"), { auth: undefined }), { status: 401, next: false });
});

test("clubId nunca se acepta desde el frontend", async () => {
  assert.deepEqual(await request(rejectClientClubId, { query: { clubId: "otro-club" } }), { status: 400, next: false });
  assert.deepEqual(await request(rejectClientClubId), { status: 200, next: true });
});

test("la restricción de identidad se aplica además del permiso de importación", async () => {
  const previous = process.env.IMPORT_OPERATOR_USER;
  process.env.IMPORT_OPERATOR_USER = "admin@club.test";
  try {
    const importAuth = { ...auth, permissions: [...auth.permissions, "imports:run"] };
    assert.equal(isImportOperator(importAuth), true);
    assert.deepEqual(await request(requireImportOperator, { auth: importAuth }), { status: 200, next: true });
    assert.deepEqual(await request(requireImportOperator, { auth: { ...importAuth, email: "owner@other.test" } }), { status: 403, next: false });
    assert.deepEqual(await request(requireImportOperator, { auth: { ...importAuth, userId: null } }), { status: 403, next: false });
  } finally {
    if (previous === undefined) delete process.env.IMPORT_OPERATOR_USER;
    else process.env.IMPORT_OPERATOR_USER = previous;
  }
});

test("el permiso tenant habilita migraciones cuando no existe una identidad adicional configurada", () => {
  const previous = process.env.IMPORT_OPERATOR_USER;
  delete process.env.IMPORT_OPERATOR_USER;
  try {
    assert.equal(isImportOperator({ ...auth, permissions: ["imports:run"] }), true);
    assert.equal(isImportOperator({ ...auth, permissions: [] }), false);
    assert.equal(isImportOperator({ ...auth, membershipId: undefined, permissions: ["imports:run"] }), false);
  } finally {
    if (previous !== undefined) process.env.IMPORT_OPERATOR_USER = previous;
  }
});
