import { createHmac, timingSafeEqual } from "node:crypto";
import type express from "express";

export const authEnabled = process.env.AUTH_ENABLED === "true";
export const authUser = process.env.AUTH_USER ?? "";
export const authPassword = process.env.AUTH_PASSWORD ?? "";
export const sessionSecret = process.env.SESSION_SECRET ?? "";
export const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
export const sessionCookieName = "miclub_session";
export const sessionMaxAgeMs = 12 * 60 * 60 * 1000;

if (authEnabled && !sessionSecret) {
  throw new Error("SESSION_SECRET es obligatorio cuando AUTH_ENABLED=true.");
}

if (authEnabled && (!authUser || !authPassword)) {
  throw new Error("AUTH_USER y AUTH_PASSWORD son obligatorios cuando AUTH_ENABLED=true.");
}

type SessionPayload = {
  username: string;
  expiresAt: number;
};

const base64UrlEncode = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const base64UrlDecode = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const signSessionPayload = (payload: string): string =>
  createHmac("sha256", sessionSecret).update(payload).digest("base64url");

export const createSessionCookieValue = (username: string): string => {
  const payload = base64UrlEncode(JSON.stringify({ username, expiresAt: Date.now() + sessionMaxAgeMs } satisfies SessionPayload));
  return `${payload}.${signSessionPayload(payload)}`;
};

export const safeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
};

export const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) return [cookie, ""];
        return [cookie.slice(0, separatorIndex), decodeURIComponent(cookie.slice(separatorIndex + 1))];
      })
  );
};

export const getSession = (req: express.Request): SessionPayload | null => {
  if (!authEnabled || !sessionSecret) return null;
  const cookieValue = parseCookies(req.headers.cookie)[sessionCookieName];
  if (!cookieValue) return null;

  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature || !safeEqual(signature, signSessionPayload(payload))) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as Partial<SessionPayload>;
    if (typeof session.username !== "string" || typeof session.expiresAt !== "number") return null;
    if (session.expiresAt <= Date.now()) return null;
    return { username: session.username, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
};

export const shouldUseSecureCookie = (req: express.Request): boolean =>
  req.secure || req.get("x-forwarded-proto") === "https" || publicAppUrl.startsWith("https://");

export const setSessionCookie = (req: express.Request, res: express.Response, username: string) => {
  res.cookie(sessionCookieName, createSessionCookieValue(username), {
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

export const createAuthProtection = (options: { isProduction: boolean }): express.RequestHandler => {
  const isFrontendNavigation = (req: express.Request): boolean =>
    options.isProduction && req.method === "GET" && Boolean(req.accepts("html")) && !req.path.includes(".") && !isProtectedApiPath(req.path);

  return (req, res, next) => {
    if (!authEnabled) return next();
    if (req.path.startsWith("/auth/") || req.path === "/health") return next();
    if (getSession(req)) return next();

    if (isFrontendNavigation(req)) return next();
    return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
  };
};

export const authProtection = createAuthProtection({ isProduction: process.env.NODE_ENV === "production" });
