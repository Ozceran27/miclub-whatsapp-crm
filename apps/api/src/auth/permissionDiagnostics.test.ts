import assert from "node:assert/strict";
import test from "node:test";
import { KNOWN_PERMISSIONS, PERMISSIONS } from "@miclub/shared";
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
