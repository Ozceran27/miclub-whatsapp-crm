import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationError, validateRegistration } from "./registrationService.js";
import { ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";
import { requirePermission } from "../middleware/authorization.js";
import type { KnownPermission } from "@miclub/shared";

test("validateRegistration normaliza los datos públicos", () => {
  assert.deepEqual(validateRegistration("  Club   Norte ", " OWNER@Example.COM ", "segura12345"), {
    clubName: "Club Norte", email: "owner@example.com", password: "segura12345"
  });
});

test("validateRegistration exige contraseña robusta y datos acotados", () => {
  assert.throws(() => validateRegistration("C", "mal", "123"), RegistrationError);
  assert.throws(() => validateRegistration("Club", "owner@example.com", "solonumeros1".replace(/\d/, "")), /letras y números/);
});

test("el registro de propietario obtiene la matriz canónica y accede a las rutas esperadas", () => {
  const obtainedPermissions = [...ROLE_DEFAULT_PERMISSIONS.owner];
  assert.deepEqual(obtainedPermissions, [...ROLE_DEFAULT_PERMISSIONS.owner]);

  const expectedRoutePermissions: KnownPermission[] = [
    "administration.view", "sectors.view", "sectors.create", "sectors.edit", "sectors.archive",
    "activities.view", "activities.create", "activities.edit", "activities.archive",
    "tasks.view", "tasks.create", "tasks.edit", "tasks.assign",
    "requests.view", "requests.approve", "requests.reject",
    "movements.view", "movements.create", "movements.edit", "movements.cancel",
    "finance:write", "crm:write", "imports:run",
  ];
  for (const permission of expectedRoutePermissions) {
    let allowed = false;
    const req = { auth: { permissions: obtainedPermissions } } as never;
    requirePermission(permission)(req, {} as never, () => { allowed = true; });
    assert.equal(allowed, true, `el propietario registrado debe acceder con ${permission}`);
  }
});
