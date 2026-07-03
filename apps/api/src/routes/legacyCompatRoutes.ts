import { Router, type Response } from "express";
import type { Member, OperationalStatusKey, StatusBreakdown } from "@miclub/shared";
import { getAdminMovementsFromGoogleSheets, getClubFinanceDebugFromGoogleSheets, getClubOperationsSummaryFromGoogleSheets, getGoogleSheetsConfig, getMembersFromGoogleSheets, getPaymentsDebugFromGoogleSheets, getSectorOperationalDebug, getSectorOperationalSummary, normalizeOperationalStatus, SHEET_NAMES, type SyncStatus } from "../services/googleSheets.js";
import { shouldUsePostgresDataSource } from "../services/dataSourceService.js";
import { emptyPostgresClubFinanceSummary, emptyPostgresSectorOperationalSummary, emptyPostgresSummary, getPostgresClubFinanceSummary, getPostgresDebtors, getPostgresMembers, getPostgresSectorOperationalSummary, getPostgresSummary } from "../services/postgresDashboardService.js";
import { getPostgresHealth } from "../db/health.js";
import { validatePostgresEnv } from "../config/env.js";
import { compareLegacyMembersWithPostgresEnrollments, compareLegacySummaryWithPostgresDashboard, compareLegacyWithPostgres } from "../services/comparisonService.js";
import { members as mockMembers } from "../data/mockData.js";

const jsonError = (res: Response, status: number, message: string) =>
  res.status(status).json({ error: true, message });

let lastSyncAt: string | undefined;
let lastSyncError: string | undefined;
const mockSyncWarningKeys = new Set<string>();

const warnMockSyncStatus = (reason: string): void => {
  if (mockSyncWarningKeys.has(reason)) return;
  mockSyncWarningKeys.add(reason);
  console.warn(`[sync-status] Respondiendo con source=mock (${reason}). mockData es fallback legacy y no fuente productiva.`);
};

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

export const getMembersSource = async (): Promise<{ members: Member[]; syncStatus: SyncStatus }> => {
  if (shouldUsePostgresDataSource()) {
    const members = await getPostgresMembers();
    lastSyncAt = new Date().toISOString();
    lastSyncError = undefined;
    return { members, syncStatus: { source: "postgres", enabled: true, sheets: [], lastSyncAt } };
  }

  const config = getGoogleSheetsConfig();

  if (!config.enabled) {
    lastSyncError = undefined;
    warnMockSyncStatus("google_sheets_disabled");
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: false, sheets: SHEET_NAMES }
    };
  }

  if (!config.credentialsPresent) {
    lastSyncError = "Google Sheets está habilitado pero faltan credenciales. Usando datos mock.";
    console.warn(lastSyncError);
    warnMockSyncStatus("google_sheets_missing_credentials");
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
    warnMockSyncStatus("google_sheets_sync_failed");
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

export const isDebtorMember = (member: Member): boolean => normalizeOperationalStatus(member.estado) === "adeudando";

// legacy-compat: paths raíz consumidos por el frontend actual; no renombrar sin migración frontend.
export const createLegacyCompatRoutes = (debugEndpointsEnabled: boolean) => {
  const router = Router();

  router.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));

  // legacy-compat: estos paths raíz son consumidos por el frontend actual; no renombrar sin migración frontend.
  router.get("/members", async (_req, res) => {
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

  router.get("/debtors", async (_req, res) => {
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

  router.get("/summary", async (_req, res) => {
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

  router.get("/admin-movements", async (_req, res) => {
    try {
      res.json(await getAdminMovementsFromGoogleSheets());
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron leer los movimientos de ADMINISTRACIÓN.";
      jsonError(res, 500, message);
    }
  });

  router.get("/club-finance-summary", async (_req, res) => {
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

  router.get("/sector-operational-summary", async (_req, res) => {
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

  router.get("/sync-status", async (_req, res) => {
    try {
      if (shouldUsePostgresDataSource()) return res.json(await getPostgresSyncStatus());
      const { syncStatus } = await getMembersSource();
      res.json(syncStatus);
    } catch {
      jsonError(res, 500, "No se pudo obtener el estado de sincronización.");
    }
  });

  if (debugEndpointsEnabled) {
    router.get("/club-finance-debug", async (_req, res) => {
      try {
        if (shouldUsePostgresDataSource()) {
          return res.json(await getPostgresClubFinanceSummary());
        }
        const { members } = await getMembersSource();
        res.json(await getClubFinanceDebugFromGoogleSheets(members));
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer el debug financiero del club.";
        jsonError(res, 500, message);
      }
    });

    router.get("/sector-operational-debug", async (_req, res) => {
      try {
        const { members } = await getMembersSource();
        res.json(await getSectorOperationalDebug(members));
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer el debug operativo por sector.";
        jsonError(res, 500, message);
      }
    });

    router.get("/status-debug", async (_req, res) => {
      try {
        const { members } = await getMembersSource();
        const normalizedStatusBreakdown = buildStatusBreakdown(members);
        res.json({ totalMembers: members.length, rawStatusBreakdown: buildRawStatusBreakdown(members), normalizedStatusBreakdown });
      } catch {
        jsonError(res, 500, "No se pudo obtener el debug de estados.");
      }
    });

    router.get("/comparison-debug", async (_req, res) => {
      try {
        res.json(await compareLegacyWithPostgres());
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo comparar legacy contra PostgreSQL.";
        jsonError(res, 500, message);
      }
    });

    router.get("/comparison-debug/summary", async (_req, res) => {
      try {
        res.json(await compareLegacySummaryWithPostgresDashboard());
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo comparar /summary legacy contra dashboard PostgreSQL.";
        jsonError(res, 500, message);
      }
    });

    router.get("/comparison-debug/members", async (_req, res) => {
      try {
        res.json(await compareLegacyMembersWithPostgresEnrollments());
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo comparar miembros legacy contra enrollments/personas PostgreSQL.";
        jsonError(res, 500, message);
      }
    });

    router.get("/payments-debug", async (_req, res) => {
      try {
        res.json(await getPaymentsDebugFromGoogleSheets());
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer el debug de pagos.";
        jsonError(res, 500, message);
      }
    });
  }

  return router;
};
