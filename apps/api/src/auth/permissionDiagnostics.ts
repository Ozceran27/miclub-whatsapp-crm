import { KNOWN_PERMISSIONS, type PermissionCode } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";

type StoredAuthorizationRow = { role: string; permission: string };

export type PermissionDiagnostic = {
  unknownStoredPermissions: string[];
  ungrantedCodePermissions: PermissionCode[];
};

/**
 * Compares persisted membership grants with the canonical catalog. This is
 * diagnostic only: legacy values remain readable until a compatible rename
 * migration can be deployed.
 */
export const diagnosePermissions = async (db: QueryExecutor): Promise<PermissionDiagnostic> => {
  const result = await db.query<StoredAuthorizationRow>(`
    select distinct role.code as role, permission
      from miclub.user_club_memberships membership
      join miclub.roles role on role.id = membership.role_id
      cross join lateral unnest(coalesce(membership.permissions, '{}'::text[])) permission
     where membership.status = 'active'
  `);
  const known = new Set<string>(KNOWN_PERMISSIONS);
  const granted = new Set(result.rows.map(({ permission }) => permission));

  return {
    unknownStoredPermissions: [...new Set(result.rows.map(({ permission }) => permission).filter((permission) => !known.has(permission)))].sort(),
    ungrantedCodePermissions: KNOWN_PERMISSIONS.filter((permission) => !granted.has(permission)),
  };
};
