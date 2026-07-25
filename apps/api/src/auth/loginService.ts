import { verifyPassword } from "./passwordHasher.js";
import type { AuthenticatedContext } from "./types.js";
import type { UserRepository } from "./userRepository.js";

export const maxFailedLoginAttempts = 5;
export const lockDurationMs = 15 * 60 * 1000;

export type LoginResult =
  | { ok: true; context: AuthenticatedContext }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "locked" };

export const login = async (
  repository: UserRepository,
  email: string,
  password: string,
  now = new Date()
): Promise<LoginResult> => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = normalizedEmail ? await repository.findByEmail(normalizedEmail) : null;
  if (!user) return { ok: false, reason: "invalid_credentials" };
  if (user.status !== "active") return { ok: false, reason: "disabled" };
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) return { ok: false, reason: "locked" };

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failedAttempts = user.failedLoginAttempts + 1;
    const lockedUntil = failedAttempts >= maxFailedLoginAttempts
      ? new Date(now.getTime() + lockDurationMs)
      : null;
    await repository.recordFailedLogin(user.id, failedAttempts, lockedUntil);
    return { ok: false, reason: lockedUntil ? "locked" : "invalid_credentials" };
  }

  await repository.recordSuccessfulLogin(user.id, now);
  return { ok: true, context: {
    userId: user.id,
    email: user.email,
    legacy: false,
    ...(user.tenant ?? {})
  } };
};
