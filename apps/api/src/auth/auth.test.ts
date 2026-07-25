import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./passwordHasher.js";
import { login, maxFailedLoginAttempts } from "./loginService.js";
import { createSession, readSession } from "./sessionService.js";
import type { AuthUser } from "./types.js";
import type { UserRepository } from "./userRepository.js";

test("hashPassword genera hashes scrypt verificables con sal aleatoria", async () => {
  const first = await hashPassword("clave-segura");
  const second = await hashPassword("clave-segura");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("clave-segura", first), true);
  assert.equal(await verifyPassword("incorrecta", first), false);
});

test("las sesiones firmadas preservan el contexto y rechazan alteraciones", () => {
  const context = { userId: "user-1", email: "admin@miclub.test", legacy: false };
  const session = createSession(context, "un-secreto-largo", 1_000);
  assert.deepEqual(readSession(session, "un-secreto-largo", 2_000), { ...context, expiresAt: 1_000 + 12 * 60 * 60 * 1_000 });
  assert.equal(readSession(`${session}alterado`, "un-secreto-largo", 2_000), null);
  assert.equal(readSession(session, "otro-secreto", 2_000), null);
});

test("login registra éxito y aplica bloqueo después de cinco fallos", async () => {
  const passwordHash = await hashPassword("correcta");
  const user: AuthUser = {
    id: "user-1", email: "Admin@miClub.test", passwordHash, status: "active",
    failedLoginAttempts: maxFailedLoginAttempts - 1, lockedUntil: null, lastLoginAt: null
  };
  const failedUpdates: Array<{ attempts: number; lockedUntil: Date | null }> = [];
  const successfulLogins: Date[] = [];
  const repository: UserRepository = {
    async findByEmail(email) {
      assert.equal(email, "admin@miclub.test");
      return user;
    },
    async recordFailedLogin(_id, attempts, lockedUntil) { failedUpdates.push({ attempts, lockedUntil }); },
    async recordSuccessfulLogin(_id, at) { successfulLogins.push(at); }
  };
  const now = new Date("2026-07-25T12:00:00Z");

  assert.deepEqual(await login(repository, " ADMIN@MICLUB.TEST ", "incorrecta", now), { ok: false, reason: "locked" });
  assert.equal(failedUpdates[0]?.attempts, maxFailedLoginAttempts);
  assert.equal(failedUpdates[0]?.lockedUntil?.getTime(), now.getTime() + 15 * 60 * 1_000);

  user.failedLoginAttempts = 0;
  assert.deepEqual(await login(repository, "admin@miclub.test", "correcta", now), {
    ok: true, context: { userId: "user-1", email: "Admin@miClub.test", legacy: false }
  });
  assert.equal(successfulLogins[0]?.getTime(), now.getTime());
});
