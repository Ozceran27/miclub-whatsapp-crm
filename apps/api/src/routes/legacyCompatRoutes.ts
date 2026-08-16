import { PERMISSIONS } from "@miclub/shared";
import { Router, type Response } from "express";
import type { Member } from "@miclub/shared";
import { validatePostgresEnv } from "../config/env.js";
import { getPostgresHealth } from "../db/health.js";
import { normalizeOperationalStatus } from "../importers/normalizers.js";
import { getPostgresClubFinanceSummary, getPostgresDebtors, getPostgresMembers, getPostgresSectorOperationalSummary, getPostgresSummary } from "../services/postgresDashboardService.js";
import { requirePermission } from "../middleware/authorization.js";

type PostgresError = Error & { code?: string };

export const isDatabaseUnavailableError = (error: unknown): boolean => {
  const code = (error as PostgresError | null)?.code;
  return Boolean(code && (code.startsWith("08") || ["57P01", "57P02", "57P03", "53300"].includes(code)))
    || (error instanceof Error && /ECONNREFUSED|connection terminated|timeout expired/i.test(error.message));
};

const postgresFailure = (res: Response, operation: string, error: unknown, requestId?: string) => {
  const detail = error instanceof Error ? error.message : String(error);
  const unavailable = isDatabaseUnavailableError(error);
  console.error(`[postgres-dashboard] ${operation} falló (${requestId ?? "sin-request-id"}): ${detail}`, error);
  return res.status(unavailable ? 503 : 500).json({
    code: unavailable ? "DATABASE_UNAVAILABLE" : "DATABASE_QUERY_FAILED",
    message: unavailable
      ? `PostgreSQL no está disponible para ${operation}.`
      : `No se pudo consultar ${operation}.`,
    requestId,
    retryable: true,
  });
};

export const getMembersSource = async (clubId?: string): Promise<{ members: Member[] }> => {
  if (!clubId) throw new Error("clubId es obligatorio para consultar PostgreSQL");
  return { members: await getPostgresMembers(clubId) };
};

export const isDebtorMember = (member: Member): boolean => normalizeOperationalStatus(member.estado) === "adeudando";

// legacy-compat: paths raíz consumidos por el frontend actual; retiro previsto: 2026-11-06.
// PostgreSQL es su única fuente. No agregar rutas sin un consumidor frontend verificado.
export const createLegacyCompatRoutes = () => {
  const router = Router();

  router.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));

  router.get("/members", requirePermission(PERMISSIONS.PEOPLE_READ), async (req, res) => {
    try { res.json(await getPostgresMembers(req.auth!.clubId)); }
    catch (error) { postgresFailure(res, "miembros", error, req.requestId); }
  });

  router.get("/debtors", requirePermission(PERMISSIONS.FINANCE_READ), async (req, res) => {
    try { res.json(await getPostgresDebtors(req.auth!.clubId)); }
    catch (error) { postgresFailure(res, "deudores", error, req.requestId); }
  });

  router.get("/summary", requirePermission(PERMISSIONS.DASHBOARD_READ), async (req, res) => {
    try { res.json(await getPostgresSummary(req.auth!.clubId)); }
    catch (error) { postgresFailure(res, "resumen", error, req.requestId); }
  });

  router.get("/club-finance-summary", requirePermission(PERMISSIONS.FINANCE_READ), async (req, res) => {
    try { res.json(await getPostgresClubFinanceSummary(req.auth!.clubId)); }
    catch (error) { postgresFailure(res, "resumen financiero", error, req.requestId); }
  });

  router.get("/sector-operational-summary", requirePermission(PERMISSIONS.DASHBOARD_READ), async (req, res) => {
    try { res.json(await getPostgresSectorOperationalSummary(req.auth!.clubId)); }
    catch (error) { postgresFailure(res, "resumen operativo por sector", error, req.requestId); }
  });

  router.get("/sync-status", requirePermission(PERMISSIONS.ADMINISTRATION_VIEW), async (_req, res) => {
    const warnings = validatePostgresEnv();
    if (warnings.length) return postgresFailure(res, "estado de sincronización", Object.assign(new Error(warnings.join(" ")), { code: "08000" }), _req.requestId);
    try {
      await getPostgresHealth();
      res.json({ source: "postgres", enabled: true, ok: true, sheets: [], lastSyncAt: new Date().toISOString() });
    } catch (error) { postgresFailure(res, "estado de sincronización", error, _req.requestId); }
  });

  return router;
};
