import type express from "express";
import { setAuthenticatedContext } from "../auth/context.js";
import { createSession, parseCookies, readSession, sessionCookieName, sessionMaxAgeMs } from "../auth/sessionService.js";
import type { AuthenticatedContext } from "../auth/types.js";

export const authEnabled = process.env.AUTH_ENABLED === "true";
export const authUser = process.env.AUTH_USER ?? "";
export const authPassword = process.env.AUTH_PASSWORD ?? "";
export const legacyAuthEnabled = process.env.LEGACY_AUTH_ENABLED === "true";
export const sessionSecret = process.env.SESSION_SECRET ?? "";
export const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";

if (authEnabled && !sessionSecret) {
  throw new Error("SESSION_SECRET es obligatorio cuando AUTH_ENABLED=true.");
}

if (authEnabled && legacyAuthEnabled && (!authUser || !authPassword)) {
  throw new Error("AUTH_USER y AUTH_PASSWORD son obligatorios cuando LEGACY_AUTH_ENABLED=true.");
}
export { parseCookies, sessionCookieName, sessionMaxAgeMs };

export const getSession = (req: express.Request) => {
  if (!authEnabled || !sessionSecret) return null;
  return readSession(parseCookies(req.headers.cookie)[sessionCookieName], sessionSecret);
};

export const shouldUseSecureCookie = (req: express.Request): boolean =>
  req.secure || req.get("x-forwarded-proto") === "https" || publicAppUrl.startsWith("https://");

export const setSessionCookie = (req: express.Request, res: express.Response, context: AuthenticatedContext) => {
  res.cookie(sessionCookieName, createSession(context, sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(req),
    maxAge: sessionMaxAgeMs,
    path: "/"
  });
};

export const clearSessionCookie = (req: express.Request, res: express.Response) => {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(req),
    path: "/"
  });
};

export const protectedApiPrefixes = [
  "/members",
  "/debtors",
  "/summary",
  "/admin-movements",
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
  "/api/modules"
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

  return (req, res, next) => {
    if (!authEnabled) return next();
    if (req.path.startsWith("/auth/") || req.path === "/health") return next();
    const session = getSession(req);
    if (session) {
      setAuthenticatedContext(req, { userId: session.userId, email: session.email, legacy: session.legacy });
      return next();
    }

    if (isFrontendNavigation(req)) return next();
    return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
  };
};

export const authProtection = createAuthProtection({ isProduction: process.env.NODE_ENV === "production" });
