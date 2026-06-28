import { Router, type NextFunction, type Request, type Response } from "express";
import { getPostgresPool } from "../db/postgres.js";
import { getMovementImportAudit, importGoogleSheets, parseMissingEnrollmentStrategy } from "../importers/googleSheetsImporter.js";
import { listImportBatches, listImportErrors } from "../importers/importLogger.js";
import asyncHandler from "./asyncHandler.js";

const router = Router();

const requireImportEndpointsEnabled = (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.IMPORT_ENDPOINTS_ENABLED !== "true") return res.status(404).json({ error: true, message: "Endpoints de importación deshabilitados." });
  return next();
};

export const parseBatchSize = (value: unknown, fallback = 50): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback;
};

const parsePagination = (query: Record<string, unknown>) => ({
  limit: Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200),
  offset: Math.max(Number(query.offset ?? 0) || 0, 0)
});

router.use(requireImportEndpointsEnabled);

router.post("/google-sheets", asyncHandler(async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  const batchSizeValue = req.body?.batchSize;
  const batchSize = parseBatchSize(batchSizeValue, Number.NaN);

  if (batchSizeValue !== undefined && Number.isNaN(batchSize)) {
    return res.status(400).json({ error: true, message: "batchSize debe ser un entero positivo." });
  }

  const missingEnrollmentStrategy = req.body?.missingEnrollmentStrategy === undefined ? undefined : parseMissingEnrollmentStrategy(req.body.missingEnrollmentStrategy);
  const summary = await importGoogleSheets({ dryRun, batchSize: Number.isNaN(batchSize) ? 50 : batchSize, missingEnrollmentStrategy });
  res.status(dryRun ? 200 : 202).json(summary);
}));


router.get("/google-sheets/movements/audit", asyncHandler(async (_req, res) => {
  res.json(await getMovementImportAudit());
}));

router.get("/batches", asyncHandler(async (req, res) => {
  const pool = await getPostgresPool();
  const { limit, offset } = parsePagination(req.query);
  const rows = await listImportBatches(pool, limit, offset);
  const total = Number((rows[0] as { total_count?: string | number } | undefined)?.total_count ?? 0);
  res.json({ rows, total, limit, offset });
}));

router.get("/batches/:id/errors", asyncHandler(async (req, res) => {
  const pool = await getPostgresPool();
  const { limit, offset } = parsePagination(req.query);
  const rows = await listImportErrors(pool, String(req.params.id), limit, offset);
  const total = Number((rows[0] as { total_count?: string | number } | undefined)?.total_count ?? 0);
  res.json({ rows, total, limit, offset });
}));

export default router;
