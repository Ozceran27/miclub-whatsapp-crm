import { randomUUID } from "node:crypto";
import cors, { type CorsOptions } from "cors";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { sessionCookieName } from "../auth/sessionService.js";
import { getPostgresPool } from "../db/postgres.js";

const DEFAULT_JSON_LIMIT = "1mb";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const splitOrigins = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const getAllowedOrigins = (): Set<string> => {
  const configured = [process.env.PUBLIC_APP_URL, ...splitOrigins(process.env.CORS_ORIGINS)];
  return new Set(configured.flatMap((value) => {
    if (!value) return [];
    const origin = normalizeOrigin(value);
    if (!origin) console.warn(`Origen CORS inválido ignorado: ${value}`);
    return origin ? [origin] : [];
  }));
};

export const corsOptions = (allowedOrigins = getAllowedOrigins()): CorsOptions => ({
  credentials: true,
  origin(origin, callback) {
    // Requests without Origin are not browser CORS requests (health checks, CLI).
    if (!origin) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    return callback(null, normalized !== null && allowedOrigins.has(normalized));
  }
});

// Helmet-equivalent response hardening kept local so security does not depend on
// middleware defaults changing between releases.
export const helmet: RequestHandler = (_req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data: https:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-XSS-Protection": "0"
  });
  next();
};

export const requestId: RequestHandler = (req, res, next) => {
  const supplied = req.get("x-request-id");
  const id = supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  req.requestId = id;
  res.set("X-Request-Id", id);
  next();
};

type RateLimitOptions = { windowMs: number; max: number; message: string };
type Bucket = { count: number; resetAt: number };

export const createRateLimit = ({ windowMs, max, message }: RateLimitOptions): RequestHandler => {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: true, message, requestId: req.requestId });
    }
    // Prevent unbounded growth without a timer keeping the process alive.
    if (buckets.size > 10_000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    next();
  };
};

export const createDistributedRateLimit = ({ windowMs, max, message }: RateLimitOptions, scope: string): RequestHandler =>
  async (req, res, next) => {
    try {
      const now = Date.now();
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const email = scope === "auth" && typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
      const key = `${scope}:${ip}:${email}`;
      const pool = await getPostgresPool();
      const result = await pool.query<{ request_count: number }>(
        `insert into miclub.rate_limit_buckets(bucket_key, window_start, request_count, expires_at)
         values ($1,$2,1,$3)
         on conflict (bucket_key, window_start) do update set request_count=miclub.rate_limit_buckets.request_count+1
         returning request_count`, [key, windowStart, new Date(windowStart.getTime() + windowMs)],
      );
      const count = Number(result.rows[0]?.request_count ?? 1);
      const resetAt = windowStart.getTime() + windowMs;
      res.set("RateLimit-Limit", String(max));
      res.set("RateLimit-Remaining", String(Math.max(0, max - count)));
      res.set("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
      if (count > max) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
        return res.status(429).json({ error: true, message, requestId: req.requestId });
      }
      next();
    } catch (error) { next(error); }
  };

const rateLimit = (options: RateLimitOptions, scope: string) => process.env.RATE_LIMIT_STORE === "postgres"
  ? createDistributedRateLimit(options, scope)
  : createRateLimit(options);
export const authRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, message: "Demasiados intentos de autenticación. Intente nuevamente más tarde." }, "auth");
export const importRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 5, message: "Demasiadas solicitudes de importación. Intente nuevamente más tarde." }, "import");

/** Status/history reads must not consume the small mutation budget. */
export const importMutationRateLimit: RequestHandler = (req, res, next) =>
  MUTATING_METHODS.has(req.method) ? importRateLimit(req, res, next) : next();

const hasSessionCookie = (req: Request): boolean =>
  (req.headers.cookie ?? "").split(";").some((cookie) => cookie.trim().startsWith(`${sessionCookieName}=`));

/**
 * Cookie-authenticated mutations must come from an explicitly trusted browser
 * origin. SameSite=Lax remains defence-in-depth; this check is the CSRF policy.
 */
export const csrfProtection = (allowedOrigins = getAllowedOrigins()): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(req.method) || !hasSessionCookie(req)) return next();
    // El logout no modifica datos y debe poder destruir la cookie aun si un
    // proxy omite Origin o la configuración de orígenes quedó desactualizada.
    if (req.path === "/auth/logout") return next();
    const origin = req.get("origin");
    if (origin && normalizeOrigin(origin) && allowedOrigins.has(normalizeOrigin(origin)!)) return next();
    return res.status(403).json({ error: true, message: "Origen no permitido por la política CSRF.", requestId: req.requestId });
  };

export const jsonBodyLimit = process.env.JSON_BODY_LIMIT?.trim() || DEFAULT_JSON_LIMIT;
export { cors };
