import type { LegacyUnknownCode } from "./legacy.js";
import { asLegacyUnknownCode } from "./legacy.js";

export const KNOWN_ROLES = ["owner", "DIRECTOR", "admin"] as const;
export type KnownRole = typeof KNOWN_ROLES[number];
export type LegacyRole = LegacyUnknownCode<"role">;
export type RoleCode = KnownRole | LegacyRole;
export const toRoleCode = (value: string): RoleCode =>
  (KNOWN_ROLES as readonly string[]).includes(value) ? value as KnownRole : asLegacyUnknownCode<"role">(value);

export const KNOWN_PERMISSIONS = [
  "imports:run",
  "crm:write",
  "people:read",
  "sectors:any",
  "administration.view",
  "administration.configure",
  "sectors.view",
  "sectors.create",
  "sectors.edit",
  "sectors.archive",
  "activities.view",
  "activities.create",
  "activities.edit",
  "activities.archive",
  "workers.view",
  "workers.manage",
  "tasks.view",
  "tasks.create",
  "tasks.edit",
  "tasks.assign",
  "requests.view",
  "requests.approve",
  "requests.reject",
  "movements.view",
  "movements.create",
  "movements.edit",
  "movements.cancel",
  "enrollments.view",
  "enrollments.create",
  "enrollments.edit",
  "enrollments.cancel",
] as const;
export type KnownPermission = typeof KNOWN_PERMISSIONS[number];
export type LegacyPermission = LegacyUnknownCode<"permission">;
export type PermissionCode = KnownPermission | LegacyPermission;
export const toPermissionCode = (value: string): PermissionCode =>
  (KNOWN_PERMISSIONS as readonly string[]).includes(value) ? value as KnownPermission : asLegacyUnknownCode<"permission">(value);

/** Deliberately excludes password hashes, signed-session fields and internal membership metadata. */
export interface PublicAuthUser {
  userId: string;
  email: string;
  clubId: string;
  membershipId: string;
  role: RoleCode;
  permissions: readonly PermissionCode[];
}

export interface AuthResponse {
  authenticated: boolean;
  authEnabled?: boolean;
  username?: string;
  message?: string;
  user?: PublicAuthUser;
}
