import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { login } from "../auth/loginService.js";
import { getActiveMembershipContext, listActiveMemberships, postgresUserRepository } from "../auth/userRepository.js";
import { authEnabled, authPassword, authUser, clearSessionCookie, getSession, legacyAuthEnabled, setSessionCookie } from "../middleware/auth.js";
import asyncHandler from "./asyncHandler.js";
import { registerClubOwner, RegistrationError } from "../auth/registrationService.js";
import { auditService } from "../services/auditService.js";
import { isImportOperator } from "../middleware/authorization.js";

// auth: paths públicos de autenticación; no renombrar sin migración frontend.
const router = Router();

const safeEqual = (first: string, second: string): boolean => {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
};

router.post("/login", asyncHandler(async (req, res) => {
  if (!authEnabled) return res.json({ authenticated: true, authEnabled: false, username: null });

  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const result = await login(postgresUserRepository, username, password).catch((error: unknown) => {
    if (!legacyAuthEnabled) throw error;
    console.warn("No se pudo autenticar contra miclub.users; se evaluará el acceso legacy.", error);
    return { ok: false, reason: "invalid_credentials" } as const;
  });

  if (result.ok) {
    setSessionCookie(req, res, result.context);
    await auditService.login({ action: "auth.login", result: "success", userId: result.context.userId, clubId: result.context.clubId, membershipId: result.context.membershipId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }).catch((error) => console.error("No se pudo auditar el login", error));
    return res.json({ authenticated: true, username: result.context.email, canAccessDataMigration: isImportOperator(result.context), user: result.context });
  }

  if (legacyAuthEnabled && safeEqual(username, authUser) && safeEqual(password, authPassword)) {
    const context = { userId: null, email: authUser, legacy: true } as const;
    setSessionCookie(req, res, context);
    return res.json({ authenticated: true, username: authUser, user: context });
  }

  const message = result.reason === "locked" ? "Cuenta temporalmente bloqueada" : "Credenciales inválidas";
  return res.status(401).json({ authenticated: false, message });
}));

router.post("/register", asyncHandler(async (req, res) => {
  if (!authEnabled || process.env.PUBLIC_REGISTRATION_ENABLED !== "true") return res.status(404).json({ authenticated: false, message: "El registro público no está habilitado." });
  const body = req.body as { clubName?: unknown; email?: unknown; password?: unknown };
  try {
    const context = await registerClubOwner(body.clubName, body.email, body.password);
    setSessionCookie(req, res, context);
    await auditService.registration({ action: "auth.registration", result: "success", userId: context.userId, clubId: context.clubId, membershipId: context.membershipId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }).catch((error) => console.error("No se pudo auditar el registro", error));
    return res.status(201).json({ authenticated: true, username: context.email, canAccessDataMigration: false, user: context });
  } catch (error) {
    if (error instanceof RegistrationError) return res.status(error.code === "email_exists" ? 409 : 400).json({ authenticated: false, message: error.message });
    throw error;
  }
}));

router.post("/logout", asyncHandler(async (req, res) => {
  const session = getSession(req);
  clearSessionCookie(req, res);
  if (session?.userId) await auditService.logout({ action: "auth.logout", result: "success", userId: session.userId, clubId: session.clubId, membershipId: session.membershipId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }).catch((error) => console.error("No se pudo auditar el logout", error));
  return res.json({ authenticated: false });
}));

router.get("/clubs", asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session?.userId) return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
  res.json({ clubs: await listActiveMemberships(session.userId), selectedMembershipId: session.membershipId ?? null });
}));

router.post("/clubs/select", asyncHandler(async (req, res) => {
  const session = getSession(req);
  const membershipId = typeof req.body?.membershipId === "string" ? req.body.membershipId : "";
  if (!session?.userId) return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
  const membership = await getActiveMembershipContext(session.userId, membershipId);
  if (!membership) return res.status(403).json({ authenticated: false, message: "Membresía no autorizada" });
  const context = { ...session, clubId: membership.club_id, membershipId: membership.membership_id, role: membership.role, permissions: membership.permissions, sectorIds: membership.sector_ids };
  setSessionCookie(req, res, context);
  res.json({ authenticated: true, user: context });
}));

router.get("/me", asyncHandler(async (req, res) => {
  if (!authEnabled) return res.json({ authenticated: true, authEnabled: false, username: null });

  const session = getSession(req);
  if (!session) return res.json({ authenticated: false, authEnabled: true });

  // Membership permissions can change while the signed cookie is alive. Always
  // resolve the current authorization before advertising modules to the SPA.
  // This also upgrades cookies issued before tenant permissions were added.
  let context = session;
  if (session.userId && session.membershipId) {
    const membership = await getActiveMembershipContext(session.userId, session.membershipId);
    if (!membership) {
      clearSessionCookie(req, res);
      return res.json({ authenticated: false, authEnabled: true });
    }
    context = { ...session, clubId: membership.club_id, membershipId: membership.membership_id, role: membership.role, permissions: membership.permissions, sectorIds: membership.sector_ids };
    setSessionCookie(req, res, context);
  }

  const user = { userId: context.userId, email: context.email, legacy: context.legacy, clubId: context.clubId, membershipId: context.membershipId, role: context.role, permissions: context.permissions ?? [] };
  return res.json({ authenticated: true, authEnabled: true, username: context.email, canAccessDataMigration: isImportOperator(context), user });
}));

export default router;
