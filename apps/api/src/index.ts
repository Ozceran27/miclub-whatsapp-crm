import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findRepoRoot = (startDir: string): string => {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
        if (packageJson.name === "miclub-whatsapp-crm") return currentDir;
      } catch (error) {
        console.warn(`No se pudo leer ${packageJsonPath}:`, error);
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  const fallbackDir = process.cwd();
  console.warn(`No se encontró la raíz del repo (package.json con name=miclub-whatsapp-crm) desde ${startDir}. Usando fallback process.cwd(): ${fallbackDir}`);
  return fallbackDir;
};

const repoRoot = findRepoRoot(__dirname);
const webDistPath = path.join(repoRoot, "apps/web/dist");
const webIndexPath = path.join(webDistPath, "index.html");
const isProduction = process.env.NODE_ENV === "production" || __dirname.includes(`${path.sep}dist${path.sep}`);

dotenv.config({ path: path.join(repoRoot, ".env") });

import express from "express";
import cors from "cors";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ContactedRecentResponse, Member, MessageTemplate, OperationalStatusKey, PaginatedHistoryResponse, PrepareMessagesRequest, PreparedMessage, PrepareMessagesValidation, StatusBreakdown } from "@miclub/shared";
import { members as mockMembers, templates } from "./data/mockData.js";
import { buildWaLink, interpolateTemplate, normalizeArPhone } from "./services/messages.js";
import db from "./lib/sqlite.js";
import dbRoutes from "./routes/dbRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import peopleRoutes from "./routes/peopleRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { getAdminMovementsFromGoogleSheets, getClubFinanceDebugFromGoogleSheets, getClubOperationsSummaryFromGoogleSheets, getGoogleSheetsConfig, getMembersFromGoogleSheets, getPaymentsDebugFromGoogleSheets, getSectorOperationalDebug, getSectorOperationalSummary, normalizeOperationalStatus, SHEET_NAMES, type SyncStatus } from "./services/googleSheets.js";
import { shouldUsePostgresDataSource } from "./services/dataSourceService.js";
import { getPostgresClubFinanceSummary, getPostgresDebtors, getPostgresMembers, getPostgresSectorOperationalSummary, getPostgresSummary } from "./services/postgresDashboardService.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const authEnabled = process.env.AUTH_ENABLED === "true";
const authUser = process.env.AUTH_USER ?? "";
const authPassword = process.env.AUTH_PASSWORD ?? "";
const sessionSecret = process.env.SESSION_SECRET ?? "";
const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
const sessionCookieName = "miclub_session";
const sessionMaxAgeMs = 12 * 60 * 60 * 1000;

if (authEnabled && !sessionSecret) {
  throw new Error("SESSION_SECRET es obligatorio cuando AUTH_ENABLED=true.");
}

if (authEnabled && (!authUser || !authPassword)) {
  throw new Error("AUTH_USER y AUTH_PASSWORD son obligatorios cuando AUTH_ENABLED=true.");
}

app.set("trust proxy", true);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/api/db", dbRoutes);

if (isProduction) {
  app.use(express.static(webDistPath));
}

const jsonError = (res: express.Response, status: number, message: string) =>
  res.status(status).json({ error: true, message });

type SessionPayload = {
  username: string;
  expiresAt: number;
};

const base64UrlEncode = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const base64UrlDecode = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const signSessionPayload = (payload: string): string =>
  createHmac("sha256", sessionSecret).update(payload).digest("base64url");

const createSessionCookieValue = (username: string): string => {
  const payload = base64UrlEncode(JSON.stringify({ username, expiresAt: Date.now() + sessionMaxAgeMs } satisfies SessionPayload));
  return `${payload}.${signSessionPayload(payload)}`;
};

const safeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
};

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
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

const getSession = (req: express.Request): SessionPayload | null => {
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

const shouldUseSecureCookie = (req: express.Request): boolean =>
  req.secure || req.get("x-forwarded-proto") === "https" || publicAppUrl.startsWith("https://");

const setSessionCookie = (req: express.Request, res: express.Response, username: string) => {
  res.cookie(sessionCookieName, createSessionCookieValue(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(req),
    maxAge: sessionMaxAgeMs,
    path: "/"
  });
};

const clearSessionCookie = (req: express.Request, res: express.Response) => {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(req),
    path: "/"
  });
};

const protectedApiPrefixes = [
  "/members",
  "/debtors",
  "/summary",
  "/admin-movements",
  "/club-finance",
  "/sector-operational",
  "/status-debug",
  "/sync-status",
  "/payments-debug",
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
  "/api/sector-finance-summary"
];

const isProtectedApiPath = (pathName: string): boolean =>
  protectedApiPrefixes.some((prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`));

const isFrontendNavigation = (req: express.Request): boolean =>
  isProduction && req.method === "GET" && Boolean(req.accepts("html")) && !req.path.includes(".") && !isProtectedApiPath(req.path);

const authProtection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!authEnabled) return next();
  if (req.path.startsWith("/auth/") || req.path === "/health") return next();
  if (getSession(req)) return next();

  if (isFrontendNavigation(req)) return next();
  return res.status(401).json({ authenticated: false, message: "Sesión requerida" });
};

const runDb = (query: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });

const allDb = <T>(query: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });

const getDb = <T>(query: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });

let lastSyncAt: string | undefined;
let lastSyncError: string | undefined;

const getMembersSource = async (): Promise<{ members: Member[]; syncStatus: SyncStatus }> => {
  if (shouldUsePostgresDataSource()) {
    const members = await getPostgresMembers();
    lastSyncAt = new Date().toISOString();
    lastSyncError = undefined;
    return { members, syncStatus: { source: "postgres", enabled: true, sheets: [], lastSyncAt } };
  }

  const config = getGoogleSheetsConfig();

  if (!config.enabled) {
    lastSyncError = undefined;
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: false, sheets: SHEET_NAMES }
    };
  }

  if (!config.credentialsPresent) {
    lastSyncError = "Google Sheets está habilitado pero faltan credenciales. Usando datos mock.";
    console.warn(lastSyncError);
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: true, sheets: SHEET_NAMES, error: lastSyncError }
    };
  }

  try {
    const googleMembers = await getMembersFromGoogleSheets();
    lastSyncAt = new Date().toISOString();
    lastSyncError = undefined;

    return {
      members: googleMembers,
      syncStatus: { source: "google_sheets", enabled: true, sheets: SHEET_NAMES, lastSyncAt }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar con Google Sheets.";
    lastSyncError = `Google Sheets falló, usando datos mock. ${message}`;
    console.warn(lastSyncError);
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: true, sheets: SHEET_NAMES, lastSyncAt, error: lastSyncError }
    };
  }
};


const unresolvedTemplateVariables = (message: string): string[] => {
  const variables = message.match(/\{\w+\}/g) ?? [];

  return Array.from(
    new Set(
      variables
        .map((token) => token.toLowerCase())
        .filter((token) => !ALLOWED_TEMPLATE_VARIABLES.has(token))
    )
  );
};

const RECENT_STATUSES = ["prepared", "opened", "sent_manual"] as const;
const normalizeFeeToArs = (fee: number | undefined): number => {
  if (typeof fee !== "number" || Number.isNaN(fee)) return 0;
  return fee;
};

const byKey = (members: Member[], getter: (m: Member) => string): Record<string, number> =>
  members.reduce<Record<string, number>>((acc, member) => {
    const key = getter(member) || "Sin datos";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const statusBreakdownKeys: Record<OperationalStatusKey, keyof Omit<StatusBreakdown, "total" | "active">> = {
  al_dia: "alDia",
  nuevo_inscripto: "nuevoInscripto",
  adeudando: "adeudando",
  abandonado: "abandonado",
  otro: "otros"
};

const buildRawStatusBreakdown = (members: Member[]): Record<string, number> =>
  members.reduce<Record<string, number>>((acc, member) => {
    const key = String(member.estado ?? "").trim() || "(vacío)";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const buildStatusBreakdown = (members: Member[]): StatusBreakdown => {
  const breakdown: StatusBreakdown = {
    total: members.length,
    active: 0,
    alDia: 0,
    nuevoInscripto: 0,
    adeudando: 0,
    abandonado: 0,
    otros: 0
  };

  for (const member of members) {
    const normalizedStatus = normalizeOperationalStatus(member.estado);
    breakdown[statusBreakdownKeys[normalizedStatus]] += 1;
  }

  breakdown.active = breakdown.total - breakdown.abandonado;
  return breakdown;
};

const isDebtorMember = (member: Member): boolean => normalizeOperationalStatus(member.estado) === "adeudando";

const ALLOWED_TEMPLATE_VARIABLES = new Set(["{nombre}", "{apellido}", "{actividad}", "{cuota}", "{modalidad}", "{instructor}"]);

const validateTemplateInput = (name: unknown, body: unknown): string | null => {
  if (typeof name !== "string" || name.trim().length === 0) return "name no puede estar vacío.";
  if (typeof body !== "string" || body.trim().length === 0) return "body no puede estar vacío.";
  const variables = body.match(/\{\w+\}/g) ?? [];
  const invalidVariables = variables.filter((variable) => !ALLOWED_TEMPLATE_VARIABLES.has(variable.toLowerCase()));
  if (invalidVariables.length > 0) return `Variables inválidas en body: ${Array.from(new Set(invalidVariables)).join(", ")}.`;
  return null;
};

const mapTemplateRow = (row: {
  id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string;
}): MessageTemplate => ({
  id: row.id,
  name: row.name,
  body: row.body,
  isDefault: row.isDefault === 1,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const seedDefaultTemplates = async () => {
  const [{ total }] = await allDb<{ total: number }>("SELECT COUNT(1) as total FROM message_templates");
  if (total > 0) return;
  const now = new Date().toISOString();
  for (const template of templates) {
    await runDb(
      `INSERT INTO message_templates (id, name, body, isDefault, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [template.id, template.name, template.body, now, now]
    );
  }
};

app.post("/auth/login", (req, res) => {
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

app.post("/auth/logout", (req, res) => {
  clearSessionCookie(req, res);
  return res.json({ authenticated: false });
});

app.get("/auth/me", (req, res) => {
  if (!authEnabled) return res.json({ authenticated: true, authEnabled: false, username: null });

  const session = getSession(req);
  if (!session) return res.json({ authenticated: false, authEnabled: true });
  return res.json({ authenticated: true, authEnabled: true, username: session.username });
});

app.use(authProtection);
app.use("/api", catalogRoutes);
app.use("/api", peopleRoutes);
app.use("/api", financeRoutes);
app.use("/api", dashboardRoutes);

app.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));
app.get("/members", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) return res.json(await getPostgresMembers());
    const { members } = await getMembersSource();
    res.json(members);
  } catch {
    jsonError(res, 500, "No se pudo obtener la lista de miembros.");
  }
});

app.get("/debtors", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) return res.json(await getPostgresDebtors());
    const { members } = await getMembersSource();
    res.json(members.filter(isDebtorMember));
  } catch {
    jsonError(res, 500, "No se pudo obtener la lista de deudores.");
  }
});

app.get("/summary", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) return res.json(await getPostgresSummary());
    const { members } = await getMembersSource();
    const debtors = members.filter(isDebtorMember);
    const statusBreakdown = buildStatusBreakdown(members);
    const rawStatusBreakdown = buildRawStatusBreakdown(members);
    res.json({
      totalMembers: members.length,
      totalDebtors: debtors.length,
      totalBySheet: byKey(members, (m) => m.sourceSheet),
      debtorsBySheet: byKey(debtors, (m) => m.sourceSheet),
      totalByActivity: byKey(members, (m) => m.actividad ?? "Sin actividad"),
      debtorsByActivity: byKey(debtors, (m) => m.actividad ?? "Sin actividad"),
      debtorsWithoutPayments: debtors.filter((d) => !d.lastPaymentAt).length,
      totalEstimatedDebt: debtors.reduce((sum, d) => sum + normalizeFeeToArs(d.cuota), 0),
      statusBreakdown,
      rawStatusBreakdown
    });
  } catch {
    jsonError(res, 500, "No se pudo obtener el resumen.");
  }
});


app.get("/admin-movements", async (_req, res) => {
  try {
    res.json(await getAdminMovementsFromGoogleSheets());
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron leer los movimientos de ADMINISTRACIÓN.";
    jsonError(res, 500, message);
  }
});

app.get("/club-finance-summary", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) return res.json(await getPostgresClubFinanceSummary());
    const { members } = await getMembersSource();
    res.json(await getClubOperationsSummaryFromGoogleSheets(members));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener el resumen financiero del club.";
    jsonError(res, 500, message);
  }
});

app.get("/club-finance-debug", async (_req, res) => {
  try {
    const { members } = await getMembersSource();
    res.json(await getClubFinanceDebugFromGoogleSheets(members));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el debug financiero del club.";
    jsonError(res, 500, message);
  }
});


app.get("/sector-operational-summary", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) return res.json(await getPostgresSectorOperationalSummary());
    const { members } = await getMembersSource();
    res.json(await getSectorOperationalSummary(members));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener el resumen operativo por sector.";
    jsonError(res, 500, message);
  }
});

app.get("/sector-operational-debug", async (_req, res) => {
  try {
    const { members } = await getMembersSource();
    res.json(await getSectorOperationalDebug(members));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el debug operativo por sector.";
    jsonError(res, 500, message);
  }
});

app.get("/status-debug", async (_req, res) => {
  try {
    const { members } = await getMembersSource();
    const normalizedStatusBreakdown = buildStatusBreakdown(members);
    res.json({
      totalMembers: members.length,
      rawStatusBreakdown: buildRawStatusBreakdown(members),
      normalizedStatusBreakdown,
      samples: members.slice(0, 50).map((member) => ({
        id: member.id,
        nombre: member.nombre,
        apellido: member.apellido,
        sourceSheet: member.sourceSheet,
        rawEstado: member.estado,
        normalizedEstado: normalizeOperationalStatus(member.estado)
      }))
    });
  } catch {
    jsonError(res, 500, "No se pudo obtener el debug de estados.");
  }
});

app.get("/sync-status", async (_req, res) => {
  try {
    const { syncStatus } = await getMembersSource();
    res.json(syncStatus);
  } catch {
    jsonError(res, 500, "No se pudo obtener el estado de sincronización.");
  }
});

app.get("/payments-debug", async (_req, res) => {
  try {
    res.json(await getPaymentsDebugFromGoogleSheets());
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el debug de pagos.";
    jsonError(res, 500, message);
  }
});

app.get("/templates", async (_req, res) => {
  try {
    const rows = await allDb<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>(
      "SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates ORDER BY isDefault DESC, datetime(createdAt) ASC"
    );
    res.json(rows.map(mapTemplateRow));
  } catch {
    jsonError(res, 500, "No se pudieron obtener las plantillas.");
  }
});

app.post("/templates", async (req, res) => {
  const body = req.body as { name?: string; body?: string };
  const validationError = validateTemplateInput(body.name, body.body);
  if (validationError) return jsonError(res, 400, validationError);
  const now = new Date().toISOString();
  const id = randomUUID();
  try {
    await runDb(
      "INSERT INTO message_templates (id, name, body, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)",
      [id, body.name?.trim(), body.body?.trim(), now, now]
    );
    const created = await getDb<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>(
      "SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates WHERE id = ?",
      [id]
    );
    res.status(201).json(created ? mapTemplateRow(created) : null);
  } catch {
    jsonError(res, 500, "No se pudo crear la plantilla.");
  }
});

app.patch("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body as { name?: string; body?: string };
  const validationError = validateTemplateInput(body.name, body.body);
  if (validationError) return jsonError(res, 400, validationError);
  try {
    const existing = await getDb<{ id: string }>("SELECT id FROM message_templates WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "Plantilla no encontrada.");
    const now = new Date().toISOString();
    await runDb("UPDATE message_templates SET name = ?, body = ?, updatedAt = ? WHERE id = ?", [body.name?.trim(), body.body?.trim(), now, id]);
    const updated = await getDb<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>(
      "SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates WHERE id = ?",
      [id]
    );
    res.json(updated ? mapTemplateRow(updated) : null);
  } catch {
    jsonError(res, 500, "No se pudo actualizar la plantilla.");
  }
});

app.delete("/templates/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await getDb<{ id: string; isDefault: number }>("SELECT id, isDefault FROM message_templates WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "Plantilla no encontrada.");
    if (existing.isDefault === 1) return jsonError(res, 400, "No se pueden eliminar plantillas predeterminadas.");
    await runDb("DELETE FROM message_templates WHERE id = ?", [id]);
    res.status(204).send();
  } catch {
    jsonError(res, 500, "No se pudo eliminar la plantilla.");
  }
});

app.post("/templates/reset-defaults", async (_req, res) => {
  const now = new Date().toISOString();
  try {
    await runDb("DELETE FROM message_templates");
    for (const template of templates) {
      await runDb(
        "INSERT INTO message_templates (id, name, body, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)",
        [template.id, template.name, template.body, now, now]
      );
    }
    const rows = await allDb<{ id: string; name: string; body: string; isDefault: number; createdAt: string; updatedAt: string }>(
      "SELECT id, name, body, isDefault, createdAt, updatedAt FROM message_templates ORDER BY datetime(createdAt) ASC"
    );
    res.json(rows.map(mapTemplateRow));
  } catch {
    jsonError(res, 500, "No se pudieron restaurar las plantillas predeterminadas.");
  }
});

app.get("/history", async (req, res) => {
  const pageRaw = Number.parseInt(String(req.query.page ?? "1"), 10);
  const pageSizeRaw = Number.parseInt(String(req.query.pageSize ?? "20"), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 20) : 20;

  try {
    const [{ total }] = await allDb<{ total: number }>(
      `SELECT COUNT(*) as total FROM (
        SELECT id
        FROM message_history
        ORDER BY datetime(createdAt) DESC
        LIMIT 200
      )`
    );

    const offset = (page - 1) * pageSize;
    const rows = await allDb<PreparedMessage>(
      `SELECT id as historyId, memberId, nombre, telefono as phone, mensaje as message, waLink,
        COALESCE(status, estado, 'prepared') as status, createdAt, openedAt, sentAt, note, templateName
      FROM (
        SELECT *
        FROM message_history
        ORDER BY datetime(createdAt) DESC
        LIMIT 200
      )
      ORDER BY datetime(createdAt) DESC
      LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const payload: PaginatedHistoryResponse = { items: rows, page, pageSize, total, totalPages };
    res.json(payload);
  } catch {
    jsonError(res, 500, "No se pudo obtener el historial.");
  }
});

app.get("/contacted-recent", async (_req, res) => {
  const windowDays = 30;
  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - windowDays);
  const since = sinceDate.toISOString();

  try {
    const rows = await allDb<{ memberId: string; eventAt: string }>(
      `SELECT memberId, COALESCE(sentAt, createdAt) as eventAt
      FROM message_history
      WHERE COALESCE(status, estado) = 'sent_manual'
      AND datetime(COALESCE(sentAt, createdAt)) >= datetime(?)
      ORDER BY datetime(COALESCE(sentAt, createdAt)) DESC`,
      [since]
    );

    const byMemberId: ContactedRecentResponse["byMemberId"] = {};
    for (const row of rows) {
      if (!row.memberId) continue;
      const existing = byMemberId[row.memberId];
      if (!existing) {
        byMemberId[row.memberId] = { lastSentAt: row.eventAt, count: 1 };
      } else {
        existing.count += 1;
      }
    }

    const payload: ContactedRecentResponse = {
      windowDays,
      since,
      memberIds: Object.keys(byMemberId),
      byMemberId
    };

    res.json(payload);
  } catch {
    jsonError(res, 500, "No se pudo obtener contactos recientes.");
  }
});

app.post("/prepare-messages/validate", async (req, res) => {
  const body = req.body as Partial<PrepareMessagesRequest>;
  if (!Array.isArray(body.memberIds) || body.memberIds.length === 0) return jsonError(res, 400, "memberIds debe ser un array no vacío.");
  if (typeof body.message !== "string" || body.message.trim().length === 0) return jsonError(res, 400, "message debe ser un string no vacío.");
  const { members } = await getMembersSource();
  const selected = members.filter((m) => body.memberIds?.includes(m.id));
  const missingPhoneMembers = selected.filter((m) => normalizeArPhone(m.telefono).length === 0).map((m) => ({ memberId: m.id, nombre: `${m.nombre} ${m.apellido}` }));
  const unresolvedVariables = unresolvedTemplateVariables(body.message);
  const placeholders = selected.slice(0, 3).map((m) => ({ memberId: m.id, nombre: `${m.nombre} ${m.apellido}`, actividad: m.actividad, cuota: m.cuota, phone: m.telefono }));
  const duplicateRows = selected.length === 0 ? [] : await allDb<{ memberId: string; nombre: string; status: string; createdAt: string }>(`SELECT memberId, nombre, COALESCE(status, estado, 'prepared') as status, createdAt FROM message_history WHERE memberId IN (${selected.map(()=>'?').join(',')}) AND COALESCE(status, estado) IN ('prepared','opened','sent_manual') ORDER BY datetime(createdAt) DESC`, selected.map(m=>m.id));
  const seen = new Set<string>();
  const duplicates = duplicateRows.filter((r) => { if (seen.has(r.memberId)) return false; seen.add(r.memberId); return true; });
  const sample = selected[0] ? interpolateTemplate(body.message, selected[0]) : body.message;
  const response: PrepareMessagesValidation = { selectedCount: selected.length, selectedPreview: placeholders, missingPhoneMembers, unresolvedVariables, duplicates, sampleMessage: sample };
  res.json(response);
});

app.post("/prepare-messages", async (req, res) => {
  const body = req.body as Partial<PrepareMessagesRequest>;

  if (!Array.isArray(body.memberIds) || body.memberIds.length === 0) {
    return jsonError(res, 400, "memberIds debe ser un array no vacío.");
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return jsonError(res, 400, "message debe ser un string no vacío.");
  }

  const { members } = await getMembersSource();
  const selected = members.filter((m) => body.memberIds?.includes(m.id));
  const nonDebtors = selected.filter((m) => !isDebtorMember(m));

  if (selected.length === 0) {
    return jsonError(res, 400, "No se encontraron miembros válidos para preparar mensajes.");
  }

  if (nonDebtors.length > 0) {
    return jsonError(res, 400, "Solo se pueden preparar mensajes para miembros con estado Adeudando.");
  }

  try {
    const prepared: PreparedMessage[] = [];

    for (const member of selected) {
      const message = interpolateTemplate(body.message, member);
      const phone = normalizeArPhone(member.telefono);
      if (!phone) continue;
      const waLink = buildWaLink(phone, message);
      const createdAt = new Date().toISOString();

      const historyInsert = await new Promise<number>((resolve, reject) => {
        db.run(
          "INSERT INTO message_history (memberId, nombre, telefono, mensaje, waLink, estado, status, createdAt, templateName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [member.id, `${member.nombre} ${member.apellido}`, phone, message, waLink, "prepared", "prepared", createdAt, body.templateName?.trim() || null],
          function onRun(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      prepared.push({ historyId: historyInsert, memberId: member.id, nombre: `${member.nombre} ${member.apellido}`, actividad: member.actividad, phone, message, waLink, status: "prepared", createdAt });
    }

    res.json(prepared);
  } catch {
    jsonError(res, 500, "No se pudieron preparar los mensajes.");
  }
});

app.patch("/history/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { status?: "prepared" | "opened" | "sent_manual" | "skipped"; note?: string | null };
  const validStatuses = new Set(["prepared", "opened", "sent_manual", "skipped"]);

  if (!Number.isInteger(id) || id <= 0) return jsonError(res, 400, "id inválido.");
  if (!body.status || !validStatuses.has(body.status)) return jsonError(res, 400, "status inválido.");

  try {
    const existing = await getDb<{ id: number }>("SELECT id FROM message_history WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "Mensaje no encontrado.");

    const now = new Date().toISOString();
    const openedAt = body.status === "opened" ? now : null;
    const sentAt = body.status === "sent_manual" ? now : null;
    await runDb(
      "UPDATE message_history SET status = ?, openedAt = COALESCE(?, openedAt), sentAt = COALESCE(?, sentAt), note = COALESCE(?, note) WHERE id = ?",
      [body.status, openedAt, sentAt, body.note ?? null, id]
    );

    const updated = await getDb<PreparedMessage>(
      `SELECT id as historyId, memberId, nombre, telefono as phone, mensaje as message, waLink,
        COALESCE(status, estado, 'prepared') as status, createdAt, openedAt, sentAt, note, templateName
      FROM message_history WHERE id = ?`,
      [id]
    );
    res.json(updated);
  } catch {
    jsonError(res, 500, "No se pudo actualizar el estado del mensaje.");
  }
});

app.use(errorHandler);

if (isProduction) {
  const sendFrontendIndex = (res: express.Response) => {
    if (!fs.existsSync(webIndexPath)) {
      return jsonError(res, 500, "Frontend no compilado. Ejecutá npm run build.");
    }

    return res.sendFile(webIndexPath);
  };

  app.get("/", (_req, res) => sendFrontendIndex(res));

  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/health") ||
      req.path.startsWith("/api/db") ||
      req.path.startsWith("/api/catalogs") ||
      req.path.startsWith("/members") ||
      req.path.startsWith("/debtors") ||
      req.path.startsWith("/summary") ||
      req.path.startsWith("/sector-operational") ||
      req.path.startsWith("/club-finance") ||
      req.path.startsWith("/admin-movements") ||
      req.path.startsWith("/payments-debug") ||
      req.path.startsWith("/templates") ||
      req.path.startsWith("/history") ||
      req.path.startsWith("/sync-status") ||
      req.path.startsWith("/prepare-messages")
    ) {
      return next();
    }

    return sendFrontendIndex(res);
  });
}

export const startServer = async () => {
  await seedDefaultTemplates();
  app.listen(port, () => {
    console.log(`API running at http://localhost:${port}`);
  });
};

export { app };

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error("No se pudo iniciar la API", error);
    process.exit(1);
  });
}
