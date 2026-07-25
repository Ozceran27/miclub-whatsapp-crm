import { Router } from "express";
import { login } from "../auth/loginService.js";
import { getActiveMembershipContext, listActiveMemberships, postgresUserRepository, revokeUserSessions } from "../auth/userRepository.js";
import { isSessionRevoked } from "../auth/sessionService.js";
import { clearSessionCookie, getSession, isAuthEnabled, setSessionCookie } from "../middleware/auth.js";
import asyncHandler from "./asyncHandler.js";
import { registerClubOwner, RegistrationError } from "../auth/registrationService.js";
import { auditService } from "../services/auditService.js";

// auth: paths públicos de autenticación; no renombrar sin migración frontend.
const router = Router();

router.post("/login", asyncHandler(async (req, res) => {
  if (!isAuthEnabled()) return res.status(503).json({ authenticated: false, authEnabled: false, code: "AUTH_CONFIGURATION_ERROR", message: "La autenticación no está habilitada" });

  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) return res.status(400).json({ authenticated: false, code: "INVALID_REQUEST", message: "Correo y contraseña son obligatorios" });
  const result = await login(postgresUserRepository, username, password);

  if (result.ok) {
    setSessionCookie(req, res, result.context);
    await auditService.login({ action: "auth.login", result: "success", userId: result.context.userId, clubId: result.context.clubId, membershipId: result.context.membershipId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }).catch((error) => console.error("No se pudo auditar el login", error));
    return res.json({ authenticated: true, username: result.context.email, user: result.context });
  }

  if (result.reason === "membership_required") return res.status(403).json({ authenticated: false, code: "NO_ACTIVE_MEMBERSHIP", message: "La cuenta no posee una membresía activa con perfil personal" });
  if (result.reason === "disabled") return res.status(403).json({ authenticated: false, code: "ACCOUNT_DISABLED", message: "Acceso denegado" });
  const message = result.reason === "locked" ? "Cuenta temporalmente bloqueada" : "Credenciales inválidas";
  return res.status(401).json({ authenticated: false, code: result.reason === "locked" ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS", message });
}));

router.post("/register", asyncHandler(async (req, res) => {
  if (!isAuthEnabled() || process.env.PUBLIC_REGISTRATION_ENABLED !== "true") return res.status(404).json({ authenticated: false, message: "El registro público no está habilitado." });
  const body = req.body as { clubName?: unknown; email?: unknown; password?: unknown };
  try {
    const context = await registerClubOwner(body.clubName, body.email, body.password);
    setSessionCookie(req, res, context);
    await auditService.registration({ action: "auth.registration", result: "success", userId: context.userId, clubId: context.clubId, membershipId: context.membershipId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }).catch((error) => console.error("No se pudo auditar el registro", error));
    return res.status(201).json({ authenticated: true, username: context.email, user: context });
  } catch (error) {
    if (error instanceof RegistrationError) return res.status(error.code === "email_exists" ? 409 : 400).json({ authenticated: false, message: error.message });
    throw error;
  }
}));

router.post("/logout", asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (session?.userId) await revokeUserSessions(session.userId);
  clearSessionCookie(req, res);
  if (session?.userId) await auditService.logout({ action: "auth.logout", result: "success", userId: session.userId, clubId: session.clubId, membershipId: session.membershipId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }).catch((error) => console.error("No se pudo auditar el logout", error));
  return res.json({ authenticated: false });
}));

router.get("/clubs", asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session?.userId) return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
  if (session.membershipId) {
    const current = await getActiveMembershipContext(session.userId, session.membershipId);
    if (!current || isSessionRevoked(session, current.session_revoked_before)) {
      clearSessionCookie(req, res);
      return res.status(401).json({ authenticated: false, code: "SESSION_EXPIRED", message: "La sesión fue revocada" });
    }
  }
  res.json({ clubs: await listActiveMemberships(session.userId), selectedMembershipId: session.membershipId ?? null });
}));

router.post("/clubs/select", asyncHandler(async (req, res) => {
  const session = getSession(req);
  const membershipId = typeof req.body?.membershipId === "string" ? req.body.membershipId : "";
  if (!session?.userId) return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
  if (session.membershipId) {
    const current = await getActiveMembershipContext(session.userId, session.membershipId);
    if (!current || isSessionRevoked(session, current.session_revoked_before)) {
      clearSessionCookie(req, res);
      return res.status(401).json({ authenticated: false, code: "SESSION_EXPIRED", message: "La sesión fue revocada" });
    }
  }
  const membership = await getActiveMembershipContext(session.userId, membershipId);
  if (!membership) return res.status(403).json({ authenticated: false, message: "Membresía no autorizada" });
  const context = { ...session, clubId: membership.club_id, membershipId: membership.membership_id, role: membership.role, permissions: membership.permissions, sectorIds: membership.sector_ids };
  setSessionCookie(req, res, context);
  res.json({ authenticated: true, user: context });
}));

router.get("/me", asyncHandler(async (req, res) => {
  if (!isAuthEnabled()) return res.status(503).json({ authenticated: false, authEnabled: false, code: "AUTH_CONFIGURATION_ERROR" });

  const session = getSession(req);
  if (!session) return res.status(401).json({ authenticated: false, authEnabled: true, code: "AUTHENTICATION_REQUIRED" });

  // Membership permissions can change while the signed cookie is alive. Always
  // resolve the current authorization before advertising modules to the SPA.
  // This also upgrades cookies issued before tenant permissions were added.
  let context = session;
  if (session.userId && session.membershipId) {
    const membership = await getActiveMembershipContext(session.userId, session.membershipId);
    if (!membership || isSessionRevoked(session, membership.session_revoked_before)) {
      clearSessionCookie(req, res);
      return res.status(401).json({ authenticated: false, authEnabled: true, code: "SESSION_EXPIRED" });
    }
    context = { ...session, clubId: membership.club_id, membershipId: membership.membership_id, role: membership.role, permissions: membership.permissions, sectorIds: membership.sector_ids };
    setSessionCookie(req, res, context);
  }

  const user = { userId: context.userId, personId: context.personId, email: context.email, legacy: false, clubId: context.clubId, membershipId: context.membershipId, role: context.role, permissions: context.permissions };
  return res.json({ authenticated: true, authEnabled: true, username: context.email, user });
}));

export default router;
