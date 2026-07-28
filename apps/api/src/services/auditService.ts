import { getPostgresPool } from "../db/postgres.js";
import type { QueryExecutor } from "../db/postgres.js";

export const AUDIT_EVENT_TYPES = [
  "registration",
  "login",
  "logout",
  "permission",
  "movement",
  "payment",
  "enrollment",
  "sensitive_change",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditResult = "success" | "failure" | "denied";
export type AuditData = Record<string, unknown>;

export type AuditEvent = {
  type: AuditEventType;
  action: string;
  result: AuditResult;
  userId?: string | null;
  clubId?: string | null;
  membershipId?: string | null;
  entityType?: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  oldData?: AuditData | null;
  newData?: AuditData | null;
  metadata?: AuditData;
};

const SENSITIVE_KEY = /(?:password|passwd|passphrase|credential|authorization|cookie|token|secret|api[_-]?key|private[_-]?key|session(?:id)?|refresh|access[_-]?token|client[_-]?secret)/i;
const MAX_DEPTH = 8;

/** Removes sensitive fields before any value reaches PostgreSQL. */
export const sanitizeAuditData = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditData(item, depth + 1));
  if (typeof value !== "object") return String(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, item]) => [key, sanitizeAuditData(item, depth + 1)]),
  );
};

const sanitizedJson = (value: AuditData | null | undefined): string | null => {
  if (value == null) return null;
  return JSON.stringify(sanitizeAuditData(value));
};

const normalizeIp = (ip: string | null | undefined): string | null => {
  const first = ip?.split(",", 1)[0]?.trim();
  if (!first) return null;
  if (first.startsWith("[")) return first.slice(1, first.indexOf("]"));
  return first.replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, "$1");
};

export const recordAuditEvent = async (
  event: AuditEvent,
  executor?: QueryExecutor,
): Promise<string> => {
  const db = executor ?? await getPostgresPool();
  const metadata = sanitizedJson({ ...(event.metadata ?? {}), eventType: event.type });
  const result = await db.query<{ id: string }>(`
    INSERT INTO miclub.audit_log (
      user_id, club_id, membership_id, action, entity_type, entity_id,
      old_data, new_data, ip, user_agent, request_id, result, metadata
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid,
      $7::jsonb, $8::jsonb, $9::inet, $10, $11, $12, $13::jsonb
    )
    RETURNING id
  `, [
    event.userId ?? null,
    event.clubId ?? null,
    event.membershipId ?? null,
    event.action,
    event.entityType ?? event.type,
    event.entityId ?? null,
    sanitizedJson(event.oldData),
    sanitizedJson(event.newData),
    normalizeIp(event.ip),
    event.userAgent?.slice(0, 1000) ?? null,
    event.requestId?.slice(0, 255) ?? null,
    event.result,
    metadata,
  ]);

  return result.rows[0].id;
};

/** Single entry point for authentication, authorization, finance and sensitive-change audits. */
export const auditService = {
  record: recordAuditEvent,
  registration: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "registration" }, executor),
  login: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "login" }, executor),
  logout: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "logout" }, executor),
  permission: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "permission" }, executor),
  movement: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "movement" }, executor),
  payment: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "payment" }, executor),
  enrollment: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "enrollment" }, executor),
  sensitiveChange: (event: Omit<AuditEvent, "type">, executor?: QueryExecutor) => recordAuditEvent({ ...event, type: "sensitive_change" }, executor),
};
