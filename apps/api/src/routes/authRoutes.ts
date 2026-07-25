import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { login } from "../auth/loginService.js";
import { postgresUserRepository } from "../auth/userRepository.js";
import { authEnabled, authPassword, authUser, clearSessionCookie, getSession, legacyAuthEnabled, setSessionCookie } from "../middleware/auth.js";
import asyncHandler from "./asyncHandler.js";

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
    return res.json({ authenticated: true, username: result.context.email, user: result.context });
  }

  if (legacyAuthEnabled && safeEqual(username, authUser) && safeEqual(password, authPassword)) {
    const context = { userId: null, email: authUser, legacy: true } as const;
    setSessionCookie(req, res, context);
    return res.json({ authenticated: true, username: authUser, user: context });
  }

  const message = result.reason === "locked" ? "Cuenta temporalmente bloqueada" : "Credenciales inválidas";
  return res.status(401).json({ authenticated: false, message });
}));

router.post("/logout", (req, res) => {
  clearSessionCookie(req, res);
  return res.json({ authenticated: false });
});

router.get("/me", (req, res) => {
  if (!authEnabled) return res.json({ authenticated: true, authEnabled: false, username: null });

  const session = getSession(req);
  if (!session) return res.json({ authenticated: false, authEnabled: true });
  const user = { userId: session.userId, email: session.email, legacy: session.legacy };
  return res.json({ authenticated: true, authEnabled: true, username: session.email, user });
});

export default router;
