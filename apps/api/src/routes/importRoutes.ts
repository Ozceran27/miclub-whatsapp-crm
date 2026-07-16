import { Router, type NextFunction, type Request, type Response } from "express";
import { getPostgresPool } from "../db/postgres.js";
import { getMovementImportAudit, importGoogleSheets, parseMissingEnrollmentStrategy } from "../importers/googleSheetsImporter.js";
import { listImportBatches, listImportErrors } from "../importers/importLogger.js";
import asyncHandler from "./asyncHandler.js";

// migración: importadores bajo /api/import; no renombrar sin migración frontend.
const router = Router();

const requireImportEndpointsEnabled = (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.IMPORT_ENDPOINTS_ENABLED !== "true") return res.status(404).json({ error: true, message: "Endpoints de importación deshabilitados." });
  return next();
};

export const parseBatchSize = (value: unknown, fallback = 50): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : fallback;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseMissingEnrollmentDeletion = (value: unknown): { importId: string; enrollmentIds: string[] } | null => {
  if (!value || typeof value !== "object") return null;
  const body = value as { importId?: unknown; enrollmentIds?: unknown; inscriptionIds?: unknown };
  const enrollmentIds = body.enrollmentIds ?? body.inscriptionIds;
  if (typeof body.importId !== "string" || !UUID_PATTERN.test(body.importId)) return null;
  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0 || enrollmentIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) return null;
  return { importId: body.importId, enrollmentIds: [...new Set(enrollmentIds)] };
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

// This intentionally is not the generic enrollment delete route. Its scope is
// constrained to the exact missing-row set produced by a Google Sheets batch.
router.post("/google-sheets/enrollments/delete-missing", asyncHandler(async (req, res) => {
  const input = parseMissingEnrollmentDeletion(req.body);
  if (!input) return res.status(400).json({ error: true, message: "importId y enrollmentIds deben ser UUIDs válidos y enrollmentIds no puede estar vacío." });

  const pool = await getPostgresPool();
  const batch = await pool.query<{ id: string }>(
    "select id from miclub.import_batches where id = $1 and source = 'google_sheets' and status in ('completed', 'completed_with_errors')",
    [input.importId],
  );
  if (batch.rows.length === 0) return res.status(400).json({ error: true, message: "El import indicado no es una importación real de Google Sheets finalizada." });

  const candidates = await pool.query<{ id: string; blocked_by_relation: boolean }>(
    `select e.id,
            (exists (select 1 from miclub.payment_allocations pa where pa.enrollment_id = e.id)
             or exists (select 1 from miclub.receivables r where r.enrollment_id = e.id)) as blocked_by_relation
       from miclub.enrollments e
      where e.id = any($1::uuid[])
        and e.source = 'google_sheets'
        and e.missing_from_import_batch_id = $2`,
    [input.enrollmentIds, input.importId],
  );
  const byId = new Map(candidates.rows.map((candidate) => [candidate.id, candidate]));
  const errors: Array<{ id: string; message: string }> = [];
  const deletable: string[] = [];
  for (const id of input.enrollmentIds) {
    const candidate = byId.get(id);
    if (!candidate) errors.push({ id, message: "La inscripción no pertenece a los registros faltantes de este import o no tiene origen Google Sheets." });
    else if (candidate.blocked_by_relation) errors.push({ id, message: "La inscripción tiene pagos o cuentas por cobrar asociadas y se conserva para no romper la integridad histórica." });
    else deletable.push(id);
  }

  let deletedIds: string[] = [];
  if (deletable.length > 0) {
    try {
      const deleted = await pool.query<{ id: string }>(
        `delete from miclub.enrollments
          where id = any($1::uuid[])
            and source = 'google_sheets'
            and missing_from_import_batch_id = $2
          returning id`,
        [deletable, input.importId],
      );
      deletedIds = deleted.rows.map((row) => row.id);
      for (const id of deletable.filter((id) => !deletedIds.includes(id))) errors.push({ id, message: "La inscripción cambió antes de poder eliminarla; actualizá la revisión." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la inscripción.";
      for (const id of deletable) errors.push({ id, message });
    }
  }
  res.json({ ok: errors.length === 0, deletedCount: deletedIds.length, skippedCount: errors.length, deletedIds, errors });
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
