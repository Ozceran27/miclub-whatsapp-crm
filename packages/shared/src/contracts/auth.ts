import type { LegacyUnknownCode } from "./legacy.js";
import { asLegacyUnknownCode } from "./legacy.js";

export const KNOWN_ROLES = ["owner", "DIRECTOR", "admin", "TRABAJADOR", "INSTRUCTOR"] as const;
export type KnownRole = typeof KNOWN_ROLES[number];
export type LegacyRole = LegacyUnknownCode<"role">;
export type RoleCode = KnownRole | LegacyRole;
export const toRoleCode = (value: string): RoleCode =>
  (KNOWN_ROLES as readonly string[]).includes(value) ? value as KnownRole : asLegacyUnknownCode<"role">(value);

/**
 * Stable permission spellings used by persisted memberships and application code.
 *
 * The mixed `domain:action` / `domain.action` convention is intentional: these
 * values already exist in production. New names must be introduced through a
 * compatibility migration rather than by changing a value here.
 */
export const PERMISSIONS = {
  CLUB_MANAGE: "club:manage",
  USERS_MANAGE: "users:manage",
  IMPORTS_RUN: "imports:run",
  CRM_WRITE: "crm:write",
  CRM_READ: "crm:read",
  PEOPLE_READ: "people:read",
  FINANCE_READ: "finance:read",
  DASHBOARD_READ: "dashboard:read",
  SECTORS_ANY: "sectors:any",
  ADMINISTRATION_VIEW: "administration.view",
  ADMINISTRATION_CONFIGURE: "administration.configure",
  SECTORS_VIEW: "sectors.view",
  SECTORS_CREATE: "sectors.create",
  SECTORS_EDIT: "sectors.edit",
  SECTORS_ARCHIVE: "sectors.archive",
  ACTIVITIES_VIEW: "activities.view",
  ACTIVITIES_CREATE: "activities.create",
  ACTIVITIES_EDIT: "activities.edit",
  ACTIVITIES_ARCHIVE: "activities.archive",
  WORKERS_VIEW: "workers.view",
  WORKERS_MANAGE: "workers.manage",
  TASKS_VIEW: "tasks.view",
  TASKS_CREATE: "tasks.create",
  TASKS_EDIT: "tasks.edit",
  TASKS_ASSIGN: "tasks.assign",
  REQUESTS_VIEW: "requests.view",
  REQUESTS_APPROVE: "requests.approve",
  REQUESTS_REJECT: "requests.reject",
  MOVEMENTS_VIEW: "movements.view",
  MOVEMENTS_CREATE: "movements.create",
  MOVEMENTS_EDIT: "movements.edit",
  MOVEMENTS_CANCEL: "movements.cancel",
  ENROLLMENTS_VIEW: "enrollments.view",
  ENROLLMENTS_CREATE: "enrollments.create",
  ENROLLMENTS_EDIT: "enrollments.edit",
  ENROLLMENTS_CANCEL: "enrollments.cancel",
  FINANCE_WRITE: "finance:write",
  ONBOARDING_READ: "onboarding.read",
  ONBOARDING_WRITE: "onboarding.write",
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/** Roles installed for every club, including their persisted label and grants. */
export const CLUB_ROLE_DEFINITIONS = {
  DIRECTOR: { name: "Director", description: "Control total del club", permissions: Object.values(PERMISSIONS) },
  TRABAJADOR: { name: "Trabajador", description: "Operación general del club", permissions: [PERMISSIONS.DASHBOARD_READ, PERMISSIONS.TASKS_VIEW] },
  INSTRUCTOR: { name: "Instructor", description: "Gestión de actividades e inscripciones", permissions: [PERMISSIONS.DASHBOARD_READ, PERMISSIONS.SECTORS_VIEW, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.TASKS_VIEW, PERMISSIONS.ENROLLMENTS_VIEW] },
} as const satisfies Record<"DIRECTOR" | "TRABAJADOR" | "INSTRUCTOR", Readonly<{
  name: string;
  description: string;
  permissions: readonly PermissionCode[];
}>>;

/**
 * Definitive operation-to-permission matrix. Legacy alternatives are temporary
 * input compatibility only; they must never be used when provisioning a new
 * membership. Remove them after 2026-11-06 once the migration audit confirms
 * that every active legacy holder also has each canonical permission.
 */
export const AUTHORIZATION_CAPABILITIES = {
  MOVEMENTS_CREATE: { permission: PERMISSIONS.MOVEMENTS_CREATE },
  MOVEMENTS_EDIT: { permission: PERMISSIONS.MOVEMENTS_EDIT, legacyPermission: PERMISSIONS.FINANCE_WRITE },
  MOVEMENTS_CANCEL: { permission: PERMISSIONS.MOVEMENTS_CANCEL, legacyPermission: PERMISSIONS.FINANCE_WRITE },
  ENROLLMENTS_CREATE: { permission: PERMISSIONS.ENROLLMENTS_CREATE, legacyPermission: PERMISSIONS.CLUB_MANAGE },
  ENROLLMENTS_EDIT: { permission: PERMISSIONS.ENROLLMENTS_EDIT, legacyPermission: PERMISSIONS.CLUB_MANAGE },
  ENROLLMENTS_CANCEL: { permission: PERMISSIONS.ENROLLMENTS_CANCEL, legacyPermission: PERMISSIONS.CLUB_MANAGE },
} as const satisfies Record<string, Readonly<{ permission: PermissionCode; legacyPermission?: PermissionCode }>>;

export type AuthorizationCapability = keyof typeof AUTHORIZATION_CAPABILITIES;
export const LEGACY_PERMISSION_COMPATIBILITY_ENDS_ON = "2026-11-06" as const;

/** Effective check shared by API guards and UI visibility during the transition. */
export const hasAuthorizationCapability = (
  permissions: readonly string[],
  capability: AuthorizationCapability,
): boolean => {
  const rule = AUTHORIZATION_CAPABILITIES[capability];
  return permissions.includes(rule.permission)
    || ("legacyPermission" in rule && permissions.includes(rule.legacyPermission));
};

export const KNOWN_PERMISSIONS: readonly PermissionCode[] = Object.values(PERMISSIONS);
export type KnownPermission = PermissionCode;
export type LegacyPermission = LegacyUnknownCode<"permission">;
export type StoredPermissionCode = PermissionCode | LegacyPermission;
export const toPermissionCode = (value: string): StoredPermissionCode =>
  (KNOWN_PERMISSIONS as readonly string[]).includes(value) ? value as KnownPermission : asLegacyUnknownCode<"permission">(value);

/** Canonical defaults used only when the application creates a membership. */
export const ROLE_DEFAULT_PERMISSIONS = {
  owner: KNOWN_PERMISSIONS,
  DIRECTOR: CLUB_ROLE_DEFINITIONS.DIRECTOR.permissions,
  admin: KNOWN_PERMISSIONS,
  TRABAJADOR: CLUB_ROLE_DEFINITIONS.TRABAJADOR.permissions,
  INSTRUCTOR: CLUB_ROLE_DEFINITIONS.INSTRUCTOR.permissions,
} as const satisfies Record<KnownRole, readonly KnownPermission[]>;

/** Machine-readable role matrix shared by tests and manual SQL generators. */
export const ROLE_PERMISSION_MATRIX: readonly Readonly<{
  role: KnownRole;
  permissions: readonly PermissionCode[];
}>[] = KNOWN_ROLES.map((role) => ({ role, permissions: ROLE_DEFAULT_PERMISSIONS[role] }));

/**
 * Suggested least-privilege baseline for a sector-scoped operator. Sector IDs
 * remain mandatory authorization boundaries; `sectors:any` is intentionally
 * absent. Creating a persisted role still requires an explicit product decision.
 */
export const SECTOR_OPERATOR_PERMISSIONS = [
  PERMISSIONS.DASHBOARD_READ,
  PERMISSIONS.SECTORS_VIEW,
  PERMISSIONS.ACTIVITIES_VIEW,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.REQUESTS_VIEW,
  PERMISSIONS.MOVEMENTS_VIEW,
  PERMISSIONS.ENROLLMENTS_VIEW,
] as const satisfies readonly PermissionCode[];

/** Unknown/future roles receive no implicit grants; provision them explicitly. */
export const FUTURE_ROLE_DEFAULT_PERMISSIONS = [] as const satisfies readonly PermissionCode[];

/** Deliberately excludes password hashes, signed-session fields and internal membership metadata. */
export interface PublicAuthUser {
  userId: string;
  email: string;
  clubId: string;
  membershipId: string;
  role: RoleCode;
  permissions: readonly StoredPermissionCode[];
}

export interface AuthResponse {
  authenticated: boolean;
  authEnabled?: boolean;
  username?: string;
  message?: string;
  user?: PublicAuthUser;
}

/** Public tenant registration input. It intentionally contains no role or permission fields. */
export interface ClubRegistrationDto {
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  email: string;
  password: string;
  club: {
    name: string;
  };
}

/** Registration creates an account, but never creates an authenticated session. */
export interface ClubRegistrationResponse {
  success: true;
  message: string;
}
