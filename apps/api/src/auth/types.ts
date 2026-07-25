export type UserStatus = "active" | "disabled";

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
};

export type AuthenticatedContext = {
  userId: string | null;
  email: string;
  legacy: boolean;
};

export type PublicAuthUser = Pick<AuthenticatedContext, "userId" | "email" | "legacy">;
