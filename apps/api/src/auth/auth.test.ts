import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./passwordHasher.js";
import { login, maxFailedLoginAttempts } from "./loginService.js";
import { createSession, getCookieValues, isSessionRevoked, readSession } from "./sessionService.js";
import type { AuthUser } from "./types.js";
import type { UserRepository } from "./userRepository.js";

test("hashPassword genera hashes scrypt verificables con sal aleatoria", async () => {
  const first = await hashPassword("clave-segura");
  const second = await hashPassword("clave-segura");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("clave-segura", first), true);
  assert.equal(await verifyPassword("incorrecta", first), false);
});

const tenantContext = { userId: "user-1", personId: "person-1", email: "admin@miclub.test", legacy: false as const, clubId: "club-1", membershipId: "membership-1", role: "DIRECTOR", permissions: ["imports:run"], sectorIds: [] };

test("las sesiones firmadas preservan el contexto y rechazan alteraciones", () => {
  const context = tenantContext;
  const session = createSession(context, "un-secreto-largo", 1_000);
  assert.deepEqual(readSession(session, "un-secreto-largo", 2_000), { ...context, version: 2, issuedAt: 1_000, expiresAt: 1_000 + 12 * 60 * 60 * 1_000 });
  assert.equal(readSession(`${session}alterado`, "un-secreto-largo", 2_000), null);
  assert.equal(readSession(session, "otro-secreto", 2_000), null);
});

test("logout revoca una cookie capturada y cookies duplicadas se pueden auditar sin depender del orden", () => {
  const token = createSession(tenantContext, "secret", 1_000);
  assert.equal(isSessionRevoked(readSession(token, "secret", 1_001)!, new Date(1_000)), true);
  assert.deepEqual(getCookieValues(`miclub_session=legacy; other=1; miclub_session=${encodeURIComponent(token)}`, "miclub_session"), ["legacy", token]);
});

test("sesiones legacy o sin tenant completo quedan invalidadas", () => {
  const encoded = Buffer.from(JSON.stringify({ userId: null, email: "legacy@test", legacy: true, issuedAt: 1, expiresAt: Date.now() + 10_000 })).toString("base64url");
  assert.equal(readSession(`${encoded}.firma-invalida`, "secret"), null);
});

test("login registra éxito y aplica bloqueo después de cinco fallos", async () => {
  const passwordHash = await hashPassword("correcta");
  const user: AuthUser = {
    id: "user-1", email: "Admin@miClub.test", passwordHash, status: "active",
    failedLoginAttempts: maxFailedLoginAttempts - 1, lockedUntil: null, lastLoginAt: null, tenant: null
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
  assert.deepEqual(await login(repository, "admin@miclub.test", "correcta", now), { ok: false, reason: "membership_required" });
  assert.equal(successfulLogins.length, 0);
  user.tenant = { personId: "person-1", clubId: "club-1", membershipId: "membership-1", role: "DIRECTOR", permissions: [], sectorIds: [] };
  assert.equal((await login(repository, "admin@miclub.test", "correcta", now)).ok, true);
  assert.equal(successfulLogins[0]?.getTime(), now.getTime());
});
