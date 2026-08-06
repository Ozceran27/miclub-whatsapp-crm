import assert from "node:assert/strict";
import test from "node:test";
import type { KnownPermission } from "@miclub/shared";
import { requirePermission } from "../middleware/authorization.js";

const cases: Array<{ endpoint: string; permission: KnownPermission; sectorial: boolean }> = [
  { endpoint: "/api/sectores", permission: "sectors.view", sectorial: true },
  { endpoint: "/api/actividades", permission: "activities.view", sectorial: true },
  { endpoint: "/api/trabajadores", permission: "workers.view", sectorial: false },
  { endpoint: "/api/movimientos", permission: "finance:read", sectorial: true },
  { endpoint: "/api/inscripciones", permission: "enrollments.view", sectorial: true },
  { endpoint: "/api/movements", permission: "finance:read", sectorial: true },
  { endpoint: "/api/dashboard/basic", permission: "dashboard:read", sectorial: false },
  { endpoint: "/api/economy/summary", permission: "finance:read", sectorial: false },
  { endpoint: "/api/modules/economy/summary", permission: "finance:read", sectorial: false },
  { endpoint: "/members", permission: "people:read", sectorial: false },
  { endpoint: "/club-finance-debug", permission: "administration.configure", sectorial: false },
];

const authorize = (permission: KnownPermission, permissions?: readonly string[]) => {
  let status = 200;
  let next = false;
  const req = permissions === undefined ? {} : { auth: { permissions } };
  const res = { status(code: number) { status = code; return this; }, json() { return this; } };
  requirePermission(permission)(req as never, res as never, () => { next = true; });
  return { status, next };
};

for (const row of cases) {
  test(`${row.endpoint}: 401 sin sesión, 403 sin permiso y 200 con rol autorizado`, () => {
    assert.deepEqual(authorize(row.permission), { status: 401, next: false });
    assert.deepEqual(authorize(row.permission, []), { status: 403, next: false });
    for (const role of ["owner", "DIRECTOR", "admin"]) {
      assert.deepEqual(authorize(row.permission, [row.permission]), { status: 200, next: true }, role);
    }
  });

  if (row.sectorial) {
    test(`${row.endpoint}: el permiso no convierte sectorIds en acceso global`, () => {
      const limited = { permissions: [row.permission], sectorIds: ["sector-a"] };
      assert.equal(limited.permissions.includes(row.permission), true);
      assert.equal(limited.sectorIds.includes("sector-b"), false);
      assert.equal([...limited.permissions, "sectors:any"].includes("sectors:any"), true);
    });
  }
}
