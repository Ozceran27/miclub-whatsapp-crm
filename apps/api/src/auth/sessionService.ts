import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthenticatedContext } from "./types.js";

export const sessionCookieName = "miclub_session";
export const sessionMaxAgeMs = 12 * 60 * 60 * 1000;

type SessionPayload = AuthenticatedContext & { expiresAt: number };

const safeEqual = (a: string, b: string): boolean => {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};

export const createSession = (context: AuthenticatedContext, secret: string, now = Date.now()): string => {
  if (!secret) throw new Error("SESSION_SECRET es obligatorio para crear sesiones.");
  const payload = Buffer.from(JSON.stringify({ ...context, expiresAt: now + sessionMaxAgeMs } satisfies SessionPayload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

export const readSession = (value: string | undefined, secret: string, now = Date.now()): SessionPayload | null => {
  if (!value || !secret) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, createHmac("sha256", secret).update(payload).digest("base64url"))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof parsed.email !== "string" || (typeof parsed.userId !== "string" && parsed.userId !== null) || typeof parsed.legacy !== "boolean" || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
};

export const parseCookies = (header: string | undefined): Record<string, string> => Object.fromEntries(
  (header ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  })
);
