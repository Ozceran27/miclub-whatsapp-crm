import { Router } from "express";
import { authEnabled, authPassword, authUser, clearSessionCookie, getSession, safeEqual, setSessionCookie } from "../middleware/auth.js";

// auth: paths públicos de autenticación; no renombrar sin migración frontend.
const router = Router();

router.post("/login", (req, res) => {
  if (!authEnabled) return res.json({ authenticated: true, authEnabled: false, username: null });

  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const validCredentials = safeEqual(username, authUser) && safeEqual(password, authPassword);

  if (!validCredentials) {
    return res.status(401).json({ authenticated: false, message: "Credenciales inválidas" });
  }

  setSessionCookie(req, res, authUser);
  return res.json({ authenticated: true, username: authUser });
});

router.post("/logout", (req, res) => {
  clearSessionCookie(req, res);
  return res.json({ authenticated: false });
});

router.get("/me", (req, res) => {
  if (!authEnabled) return res.json({ authenticated: true, authEnabled: false, username: null });

  const session = getSession(req);
  if (!session) return res.json({ authenticated: false, authEnabled: true });
  return res.json({ authenticated: true, authEnabled: true, username: session.username });
});

export default router;
