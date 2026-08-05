import type express from "express";
import { setAuthenticatedContext } from "../auth/context.js";
import { createSession, getCookieValues, isSessionRevoked, parseCookies, readSession, sessionCookieName, sessionMaxAgeMs } from "../auth/sessionService.js";
import type { AuthenticatedContext } from "../auth/types.js";
import { getActiveMembershipContext } from "../auth/userRepository.js";

export const isAuthEnabled = (): boolean => process.env.AUTH_ENABLED === "true";
export const isExplicitTestAuthBypass = (): boolean => process.env.NODE_ENV === "test" && process.env.AUTH_ENABLED !== "true";
const getSessionSecret = (): string => process.env.SESSION_SECRET?.trim() ?? "";
export const sessionCookiePath = "/";
export const sessionCookieSameSite = "lax" as const;

export { parseCookies, sessionCookieName, sessionMaxAgeMs };

export const getSession = (req: express.Request) => {
  const sessionSecret = getSessionSecret();
  if (!isAuthEnabled() || !sessionSecret) return null;
  // RFC 6265 no define el orden cuando coexisten cookies del mismo nombre con
  // distinto Path. Validar todas evita que una cookie legacy /api o /auth tape
  // la cookie oficial `/` durante su ventana de retiro.
  for (const value of getCookieValues(req.headers.cookie, sessionCookieName)) {
    const session = readSession(value, sessionSecret);
    if (session) return session;
  }
  return null;
};

export const shouldUseSecureCookie = (req: express.Request): boolean =>
  req.secure || req.get("x-forwarded-proto") === "https" || (process.env.PUBLIC_APP_URL ?? "").startsWith("https://");

export const setSessionCookie = (req: express.Request, res: express.Response, context: AuthenticatedContext) => {
  res.cookie(sessionCookieName, createSession(context, getSessionSecret()), {
    httpOnly: true,
    sameSite: sessionCookieSameSite,
    secure: shouldUseSecureCookie(req),
    maxAge: sessionMaxAgeMs,
    path: sessionCookiePath
  });
};

export const clearSessionCookie = (req: express.Request, res: express.Response) => {
  const officialOptions = {
    httpOnly: true,
    sameSite: sessionCookieSameSite,
    secure: shouldUseSecureCookie(req),
    path: sessionCookiePath
  } as const;
  res.clearCookie(sessionCookieName, officialOptions);

  // Compatibilidad temporal: versiones anteriores emitieron la misma cookie
  // bajo /auth, /api y el dominio padre. Retirar después de 2026-10-25.
  for (const path of ["/auth", "/api"]) res.clearCookie(sessionCookieName, { ...officialOptions, path });
  if (req.hostname === "gestion.meclub.com.ar" || req.hostname.endsWith(".meclub.com.ar")) {
    for (const path of ["/", "/auth", "/api"]) {
      res.clearCookie(sessionCookieName, { ...officialOptions, path, domain: ".meclub.com.ar" });
    }
  }
};

export const protectedApiPrefixes = [
  "/members",
  "/debtors",
  "/summary",
  "/club-finance",
  "/sector-operational",
  "/status-debug",
  "/sync-status",
  "/payments-debug",
  "/comparison-debug",
  "/templates",
  "/history",
  "/contacted-recent",
  "/prepare-messages",
  "/api/catalogs",
  "/api/sectores",
  "/api/actividades",
  "/api/trabajadores",
  "/api/movimientos",
  "/api/inscripciones",
  "/api/sectors",
  "/api/activities",
  "/api/instructors",
  "/api/movement-categories",
  "/api/payment-methods",
  "/api/currencies",
  "/api/system-months",
  "/api/discount-rates",
  "/api/salon-hour-prices",
  "/api/people",
  "/api/movements",
  "/api/receivables",
  "/api/payments",
  "/api/operational-balances",
  "/api/sector-settlements",
  "/api/dashboard",
  "/api/dashboard-reconciliation",
  "/api/sector-finance-summary",
  "/api/import",
  "/api/db",
  "/api/modules",
  "/api/administration"
];

export const isProtectedApiPath = (pathName: string): boolean =>
  protectedApiPrefixes.some((prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`));

const tenantScopedPrefixes = [
  ...protectedApiPrefixes,
  "/api/economy"
];

export const isTenantScopedPath = (pathName: string): boolean =>
  tenantScopedPrefixes.some((prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`));

export const createAuthProtection = (options: { isProduction: boolean }): express.RequestHandler => {
  const isFrontendNavigation = (req: express.Request): boolean =>
    options.isProduction && req.method === "GET" && Boolean(req.accepts("html")) && !req.path.includes(".") && !isProtectedApiPath(req.path);

  return async (req, res, next) => {
    if (!isAuthEnabled()) {
      if (isExplicitTestAuthBypass()) return next();
      return res.status(503).json({ authenticated: false, code: "AUTH_CONFIGURATION_ERROR", message: "La autenticación no está habilitada" });
    }
    if (req.path.startsWith("/auth/") || req.path === "/health") return next();
    const session = getSession(req);
    if (session) {
      if (session.userId && session.membershipId) {
        try {
          const membership = await getActiveMembershipContext(session.userId, session.membershipId);
          if (!membership || isSessionRevoked(session, membership.session_revoked_before)) {
            clearSessionCookie(req, res);
            return res.status(401).json({ authenticated: false, code: "SESSION_EXPIRED", message: "La sesión fue revocada" });
          }
          setAuthenticatedContext(req, { ...session, membershipId: membership.membership_id, clubId: membership.club_id, role: membership.role, permissions: membership.permissions, sectorIds: membership.sector_ids });
          return next();
        } catch (error) { return next(error); }
      }
      clearSessionCookie(req, res);
      return res.status(401).json({ authenticated: false, code: "SESSION_LEGACY", message: "La sesión debe renovarse" });
    }

    if (isFrontendNavigation(req)) return next();
    return res.status(401).json({ authenticated: false, code: "AUTHENTICATION_REQUIRED", message: "Sesión requerida" });
  };
};

export const authProtection = createAuthProtection({ isProduction: process.env.NODE_ENV === "production" });
