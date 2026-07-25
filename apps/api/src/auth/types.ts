export type UserStatus = "active" | "disabled";

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  tenant: TenantContext | null;
};

export type AuthenticatedContext = {
  userId: string;
  personId: string;
  email: string;
  legacy: boolean;
  clubId: string;
  membershipId: string;
  role: string;
  permissions: readonly string[];
  sectorIds: readonly string[];
};

/** Identidad autenticada, independiente del tenant seleccionado. */
export type AuthContext = Pick<AuthenticatedContext, "userId" | "personId" | "email" | "legacy">;

/** Autorización efectiva dentro del club seleccionado. */
export type TenantContext = {
  personId: string;
  clubId: string;
  membershipId: string;
  role: string;
  permissions: readonly string[];
  sectorIds: readonly string[];
};

export type RequestAuthContext = AuthContext & TenantContext;

export type PublicAuthUser = Pick<AuthenticatedContext, "userId" | "email" | "legacy">;
