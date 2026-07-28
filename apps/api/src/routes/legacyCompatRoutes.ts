import { Router, type Response } from "express";
import type { Member } from "@miclub/shared";
import { validatePostgresEnv } from "../config/env.js";
import { getPostgresHealth } from "../db/health.js";
import { normalizeOperationalStatus } from "../importers/normalizers.js";
import { compareLegacyMembersWithPostgresEnrollments, compareLegacySummaryWithPostgresDashboard, compareLegacyWithPostgres } from "../services/comparisonService.js";
import { getPostgresClubFinanceSummary, getPostgresDebtors, getPostgresMembers, getPostgresReceivableEffectiveStatusDebug, getPostgresSectorOperationalSummary, getPostgresSummary } from "../services/postgresDashboardService.js";

const databaseUnavailable = (res: Response, operation: string, error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[postgres-dashboard] ${operation} no disponible: ${detail}`, error);
  return res.status(503).json({
    code: "DATABASE_UNAVAILABLE",
    message: `PostgreSQL no está disponible para ${operation}.`,
    retryable: true,
  });
};

export const getMembersSource = async (clubId?: string): Promise<{ members: Member[] }> => {
  if (!clubId) throw new Error("clubId es obligatorio para consultar PostgreSQL");
  return { members: await getPostgresMembers(clubId) };
};

export const isDebtorMember = (member: Member): boolean => normalizeOperationalStatus(member.estado) === "adeudando";

// legacy-compat: paths raíz consumidos por el frontend actual; PostgreSQL es su única fuente.
export const createLegacyCompatRoutes = (debugEndpointsEnabled: boolean) => {
  const router = Router();

  router.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));

  router.get("/members", async (req, res) => {
    try { res.json(await getPostgresMembers(req.auth!.clubId)); }
    catch (error) { databaseUnavailable(res, "miembros", error); }
  });

  router.get("/debtors", async (req, res) => {
    try { res.json(await getPostgresDebtors(req.auth!.clubId)); }
    catch (error) { databaseUnavailable(res, "deudores", error); }
  });

  router.get("/summary", async (req, res) => {
    try { res.json(await getPostgresSummary(req.auth!.clubId)); }
    catch (error) { databaseUnavailable(res, "resumen", error); }
  });

  router.get("/club-finance-summary", async (req, res) => {
    try { res.json(await getPostgresClubFinanceSummary(req.auth!.clubId)); }
    catch (error) { databaseUnavailable(res, "resumen financiero", error); }
  });

  router.get("/sector-operational-summary", async (req, res) => {
    try { res.json(await getPostgresSectorOperationalSummary(req.auth!.clubId)); }
    catch (error) { databaseUnavailable(res, "resumen operativo por sector", error); }
  });

  router.get("/sync-status", async (_req, res) => {
    const warnings = validatePostgresEnv();
    if (warnings.length) return databaseUnavailable(res, "estado de sincronización", new Error(warnings.join(" ")));
    try {
      await getPostgresHealth();
      res.json({ source: "postgres", enabled: true, ok: true, sheets: [], lastSyncAt: new Date().toISOString() });
    } catch (error) { databaseUnavailable(res, "estado de sincronización", error); }
  });

  if (debugEndpointsEnabled) {
    router.get("/club-finance-debug", async (req, res) => {
      try { res.json(await getPostgresClubFinanceSummary(req.auth!.clubId)); }
      catch (error) { databaseUnavailable(res, "debug financiero", error); }
    });
    router.get("/receivable-fees-effective-status-debug", async (req, res) => {
      try { res.json(await getPostgresReceivableEffectiveStatusDebug(req.auth!.clubId)); }
      catch (error) { databaseUnavailable(res, "debug de cuotas", error); }
    });
    router.get("/comparison-debug", async (req, res) => {
      try { res.json(await compareLegacyWithPostgres(req.auth!)); }
      catch (error) { databaseUnavailable(res, "diagnóstico de migración", error); }
    });
    router.get("/comparison-debug/summary", async (req, res) => {
      try { res.json(await compareLegacySummaryWithPostgresDashboard(req.auth!)); }
      catch (error) { databaseUnavailable(res, "diagnóstico de resumen de migración", error); }
    });
    router.get("/comparison-debug/members", async (req, res) => {
      try { res.json(await compareLegacyMembersWithPostgresEnrollments(req.auth!)); }
      catch (error) { databaseUnavailable(res, "diagnóstico de miembros de migración", error); }
    });
  }

  return router;
};
