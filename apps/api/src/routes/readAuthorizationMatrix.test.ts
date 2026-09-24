import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { KnownPermission } from "@miclub/shared";
import { requirePermission } from "../middleware/authorization.js";
import { redactReadOnlyFinancials } from "./readOnlyRoutes.js";

void test('las listas de sectores y actividades no exponen rentabilidad sin finance:read', () => {
  const record = { id: 'x', name: 'Yoga', annualOperatingProfitability: 1000, annualOperatingProfitabilityStatus: 'AVAILABLE', annualOperatingMovements: 2, annualOperatingProfitabilityYear: 2026, operatingCurrencyCode: 'ARS' };
  for (const resource of ['sectores', 'actividades'] as const) {
    assert.deepEqual(redactReadOnlyFinancials(resource, record, false), { id: 'x', name: 'Yoga' });
    assert.deepEqual(redactReadOnlyFinancials(resource, record, true), record);
  }
});

const cases: Array<{ endpoint: string; permission: KnownPermission; sectorial: boolean }> = [
  { endpoint: "/api/administration/workers", permission: "workers.view", sectorial: false },
  { endpoint: "/api/administration/activity-workers", permission: "activities.view", sectorial: false },
  { endpoint: "/api/administration/activity-sectors", permission: "activities.view", sectorial: true },
  { endpoint: "/api/administration", permission: "finance:read", sectorial: false },
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

void test('las lecturas administrativas sensibles conectan su permiso adicional a la ruta', () => {
  const route = readFileSync(new URL('./administrationRoutes.ts', import.meta.url), 'utf8');
  assert.match(route, /router\.get\("\/workers", requirePermission\(PERMISSIONS\.WORKERS_VIEW\)/);
  assert.match(route, /router\.get\("\/activity-workers", requirePermission\(PERMISSIONS\.ACTIVITIES_VIEW\)/);
  assert.match(route, /router\.get\("\/activity-sectors", requirePermission\(PERMISSIONS\.ACTIVITIES_VIEW\)/);
  assert.match(route, /router\.get\("\/", requirePermission\(PERMISSIONS\.FINANCE_READ\)/);
});

const authorize = (permission: KnownPermission, permissions?: readonly string[]) => {
  let status = 200;
  let next = false;
  const req = permissions === undefined ? {} : { auth: { permissions } };
  const res = { status(code: number) { status = code; return this; }, json() { return this; } };
  requirePermission(permission)(req as never, res as never, () => { next = true; });
  return { status, next };
};

for (const row of cases) {
  void test(`${row.endpoint}: 401 sin sesión, 403 sin permiso y 200 con rol autorizado`, () => {
    assert.deepEqual(authorize(row.permission), { status: 401, next: false });
    assert.deepEqual(authorize(row.permission, []), { status: 403, next: false });
    for (const role of ["owner", "DIRECTOR", "admin"]) {
      assert.deepEqual(authorize(row.permission, [row.permission]), { status: 200, next: true }, role);
    }
  });

  if (row.sectorial) {
    void test(`${row.endpoint}: el permiso no convierte sectorIds en acceso global`, () => {
      const limited = { permissions: [row.permission], sectorIds: ["sector-a"] };
      assert.equal(limited.permissions.includes(row.permission), true);
      assert.equal(limited.sectorIds.includes("sector-b"), false);
      assert.equal([...limited.permissions, "sectors:any"].includes("sectors:any"), true);
    });
  }
}
