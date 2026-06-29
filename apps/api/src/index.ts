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
import type { Member, OperationalStatusKey, StatusBreakdown } from "@miclub/shared";
import { members as mockMembers, templates } from "./data/mockData.js";
import db from "./lib/sqlite.js";
import { auditSqliteCrmData, migrateCrmToPostgres } from "./services/crmService.js";
import dbRoutes from "./routes/dbRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import peopleRoutes from "./routes/peopleRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import moduleRoutes from "./routes/moduleRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { createCrmRoutes } from "./routes/crmRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { getAdminMovementsFromGoogleSheets, getClubFinanceDebugFromGoogleSheets, getClubOperationsSummaryFromGoogleSheets, getGoogleSheetsConfig, getMembersFromGoogleSheets, getPaymentsDebugFromGoogleSheets, getSectorOperationalDebug, getSectorOperationalSummary, normalizeOperationalStatus, SHEET_NAMES, type SyncStatus } from "./services/googleSheets.js";
import { shouldUsePostgresDataSource } from "./services/dataSourceService.js";
import { emptyPostgresClubFinanceSummary, emptyPostgresSectorOperationalSummary, emptyPostgresSummary, getPostgresClubFinanceSummary, getPostgresDebtors, getPostgresMembers, getPostgresSectorOperationalSummary, getPostgresSummary } from "./services/postgresDashboardService.js";
import { getPostgresHealth } from "./db/health.js";
import { validatePostgresEnv, warnIfProductionCrmSourceIsNotPostgres } from "./config/env.js";
import { compareLegacyMembersWithPostgresEnrollments, compareLegacySummaryWithPostgresDashboard, compareLegacyWithPostgres } from "./services/comparisonService.js";
import { createAuthProtection, isProtectedApiPath } from "./middleware/auth.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const debugEndpointsEnabled = process.env.DEBUG_ENDPOINTS_ENABLED === "true";
warnIfProductionCrmSourceIsNotPostgres(isProduction);
app.set("trust proxy", true);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/api/db", dbRoutes);
app.get("/api/db/crm/audit", async (_req, res) => {
  try {
    res.json(await auditSqliteCrmData());
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo auditar CRM legacy.";
    jsonError(res, 500, message);
  }
});

app.post("/api/db/crm/migrate", async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  const phase = ["templates", "history", "all"].includes(req.body?.phase) ? req.body.phase : "all";
  try {
    res.json(await migrateCrmToPostgres({ dryRun, phase }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo migrar CRM a PostgreSQL.";
    jsonError(res, 500, message);
  }
});


if (isProduction) {
  app.use(express.static(webDistPath));
}

const jsonError = (res: express.Response, status: number, message: string) =>
  res.status(status).json({ error: true, message });

const runDb = (query: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });

const allDb = <T>(query: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });

let lastSyncAt: string | undefined;
let lastSyncError: string | undefined;

const postgresFallback = <T>(operation: string, fallback: T, error: unknown): T & { dataSourceError: string } => {
  const message = error instanceof Error ? error.message : `Error desconocido al consultar ${operation}.`;
  lastSyncError = `PostgreSQL no disponible para ${operation}: ${message}`;
  console.error(lastSyncError, error);
  return Object.assign(fallback as object, { dataSourceError: lastSyncError }) as T & { dataSourceError: string };
};

const getPostgresSyncStatus = async (): Promise<SyncStatus & { ok: boolean; warnings?: string[] }> => {
  const warnings = validatePostgresEnv();
  if (warnings.length > 0) {
    lastSyncError = warnings.join(" ");
    return { source: "postgres", enabled: true, ok: false, sheets: [], lastSyncAt, error: lastSyncError, warnings };
  }

  try {
    await getPostgresHealth();
    lastSyncAt = new Date().toISOString();
    lastSyncError = undefined;
    return { source: "postgres", enabled: true, ok: true, sheets: [], lastSyncAt };
  } catch (error) {
    lastSyncError = error instanceof Error ? error.message : "No se pudo consultar PostgreSQL.";
    console.error("PostgreSQL health check falló:", error);
    return { source: "postgres", enabled: true, ok: false, sheets: [], lastSyncAt, error: lastSyncError };
  }
};

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
  cancelado: "cancelado",
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
    cancelado: 0,
    otros: 0
  };

  for (const member of members) {
    const normalizedStatus = normalizeOperationalStatus(member.estado);
    breakdown[statusBreakdownKeys[normalizedStatus]] += 1;
  }

  breakdown.active = members.filter((member) => {
    const status = normalizeOperationalStatus(member.estado);
    return status !== "abandonado" && status !== "cancelado";
  }).length;
  return breakdown;
};

const isDebtorMember = (member: Member): boolean => normalizeOperationalStatus(member.estado) === "adeudando";

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

app.use("/auth", authRoutes);
app.use(createAuthProtection({ isProduction }));
app.use((req, res, next) => {
  if (isProtectedApiPath(req.path)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});
app.use("/api/import", importRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api", catalogRoutes);
app.use("/api", peopleRoutes);
app.use("/api", financeRoutes);
app.use("/api", dashboardRoutes);

app.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));
app.get("/members", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) {
      try {
        return res.json(await getPostgresMembers());
      } catch (error) {
        return res.json(postgresFallback("miembros", [], error));
      }
    }
    const { members } = await getMembersSource();
    res.json(members);
  } catch {
    jsonError(res, 500, "No se pudo obtener la lista de miembros.");
  }
});

app.get("/debtors", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) {
      try {
        return res.json(await getPostgresDebtors());
      } catch (error) {
        return res.json(postgresFallback("deudores", [], error));
      }
    }
    const { members } = await getMembersSource();
    res.json(members.filter(isDebtorMember));
  } catch {
    jsonError(res, 500, "No se pudo obtener la lista de deudores.");
  }
});

app.get("/summary", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) {
      try {
        return res.json(await getPostgresSummary());
      } catch (error) {
        return res.json(postgresFallback("resumen", emptyPostgresSummary(), error));
      }
    }
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
    if (shouldUsePostgresDataSource()) {
      try {
        return res.json(await getPostgresClubFinanceSummary());
      } catch (error) {
        return res.json(postgresFallback("resumen financiero", emptyPostgresClubFinanceSummary(), error));
      }
    }
    const { members } = await getMembersSource();
    res.json(await getClubOperationsSummaryFromGoogleSheets(members));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener el resumen financiero del club.";
    jsonError(res, 500, message);
  }
});

if (debugEndpointsEnabled) {
  app.get("/club-finance-debug", async (_req, res) => {
    try {
      const { members } = await getMembersSource();
      res.json(await getClubFinanceDebugFromGoogleSheets(members));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer el debug financiero del club.";
      jsonError(res, 500, message);
    }
  });
}


app.get("/sector-operational-summary", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) {
      try {
        return res.json(await getPostgresSectorOperationalSummary());
      } catch (error) {
        return res.json(postgresFallback("resumen operativo por sector", emptyPostgresSectorOperationalSummary(), error));
      }
    }
    const { members } = await getMembersSource();
    res.json(await getSectorOperationalSummary(members));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener el resumen operativo por sector.";
    jsonError(res, 500, message);
  }
});

if (debugEndpointsEnabled) {
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
        normalizedStatusBreakdown
      });
    } catch {
      jsonError(res, 500, "No se pudo obtener el debug de estados.");
    }
  });

  app.get("/comparison-debug", async (_req, res) => {
    try {
      res.json(await compareLegacyWithPostgres());
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo comparar legacy contra PostgreSQL.";
      jsonError(res, 500, message);
    }
  });

  app.get("/comparison-debug/summary", async (_req, res) => {
    try {
      res.json(await compareLegacySummaryWithPostgresDashboard());
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo comparar /summary legacy contra dashboard PostgreSQL.";
      jsonError(res, 500, message);
    }
  });

  app.get("/comparison-debug/members", async (_req, res) => {
    try {
      res.json(await compareLegacyMembersWithPostgresEnrollments());
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo comparar miembros legacy contra enrollments/personas PostgreSQL.";
      jsonError(res, 500, message);
    }
  });
}

app.get("/sync-status", async (_req, res) => {
  try {
    if (shouldUsePostgresDataSource()) return res.json(await getPostgresSyncStatus());
    const { syncStatus } = await getMembersSource();
    res.json(syncStatus);
  } catch {
    jsonError(res, 500, "No se pudo obtener el estado de sincronización.");
  }
});

if (debugEndpointsEnabled) {
  app.get("/payments-debug", async (_req, res) => {
    try {
      res.json(await getPaymentsDebugFromGoogleSheets());
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer el debug de pagos.";
      jsonError(res, 500, message);
    }
  });
}

app.use(createCrmRoutes({ getMembersSource, isDebtorMember }));

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
      req.path.startsWith("/comparison-debug") ||
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
