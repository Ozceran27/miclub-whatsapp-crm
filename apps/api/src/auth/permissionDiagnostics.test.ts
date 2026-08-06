import assert from "node:assert/strict";
import test from "node:test";
import { KNOWN_PERMISSIONS, KNOWN_ROLES, PERMISSIONS } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";
import { diagnosePermissions } from "./permissionDiagnostics.js";

test("diagnostica valores almacenados desconocidos y permisos canónicos sin grants", async () => {
  const db: QueryExecutor = {
    query: async <T>() => ({ rows: [
      { role: "owner", permission: PERMISSIONS.CLUB_MANAGE },
      { role: "legacy", permission: "members.read" },
    ] as T[] }),
  };
  const diagnostic = await diagnosePermissions(db);

  assert.deepEqual(diagnostic.unknownStoredPermissions, ["members.read"]);
  assert.ok(diagnostic.ungrantedCodePermissions.includes(PERMISSIONS.FINANCE_READ));
  assert.equal(diagnostic.ungrantedCodePermissions.length, KNOWN_PERMISSIONS.length - 1);
});

test("una instalación con cada rol administrativo provisionado no genera advertencias", async () => {
  const db: QueryExecutor = {
    query: async <T>() => {
      return { rows: KNOWN_ROLES.flatMap((role) => KNOWN_PERMISSIONS.map((permission) => ({ role, permission }))) as T[] };
    },
  };

  assert.deepEqual(await diagnosePermissions(db), {
    unknownStoredPermissions: [],
    ungrantedCodePermissions: [],
  });
});
