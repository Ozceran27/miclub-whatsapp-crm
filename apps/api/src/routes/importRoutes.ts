import { Router, type RequestHandler } from "express";
import { getPostgresPool } from "../db/postgres.js";
import { getMovementImportAudit, importGoogleSheets, parseMissingEnrollmentStrategy } from "../importers/googleSheetsImporter.js";
import { getAdminMovementsFromGoogleSheets } from "../services/googleSheets.js";
import { listImportBatches, listImportErrors, summarizeImportErrors } from "../importers/importLogger.js";
import { hasRecentSuccessfulDryRun } from "../repositories/importRepository.js";
import asyncHandler from "./asyncHandler.js";
import { requireImportOperator, requireMembership } from "../middleware/authorization.js";

// migración: importadores bajo /api/import; no renombrar sin migración frontend.
const router = Router();

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

router.use(requireMembership, requireImportOperator);

const requireImportFeature: RequestHandler = (_req, res, next) => {
  if (process.env.IMPORT_ENDPOINTS_ENABLED !== "true") {
    return res.status(503).json({ code: "FEATURE_DISABLED", message: "La ejecución de importaciones está deshabilitada fuera de la ventana operativa.", requestId: _req.requestId, retryable: false });
  }
  next();
};

router.get("/google-sheets/admin-movements", requireImportFeature, asyncHandler(async (_req, res) => {
  res.json(await getAdminMovementsFromGoogleSheets());
}));

router.post("/google-sheets", requireImportFeature, asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const dryRun = req.body?.dryRun !== false;
  const batchSizeValue = req.body?.batchSize;
  const batchSize = parseBatchSize(batchSizeValue, Number.NaN);

  if (batchSizeValue !== undefined && Number.isNaN(batchSize)) {
    return res.status(400).json({ error: true, message: "batchSize debe ser un entero positivo." });
  }

  const missingEnrollmentStrategy = req.body?.missingEnrollmentStrategy === undefined ? undefined : parseMissingEnrollmentStrategy(req.body.missingEnrollmentStrategy);
  const context = { requestId: req.requestId, userId: req.auth!.userId, membershipId: req.auth!.membershipId, clubId: req.auth!.clubId, mode: dryRun ? "dry-run" : "real" };
  const log = (step: string, details: Record<string, unknown> = {}) => console.info(JSON.stringify({ event: "google_sheets_import", ...context, step, elapsedMs: Date.now() - startedAt, ...details }));
  log("request_received");
  log("auth_validated");
  log("tenant_resolved");
  if (!dryRun) {
    const pool = await getPostgresPool();
    if (!await hasRecentSuccessfulDryRun(pool, req.auth!.clubId)) {
      return res.status(409).json({ code: "DRY_RUN_REQUIRED", message: "Se requiere un dry-run exitoso del mismo club durante los últimos 30 minutos.", requestId: req.requestId, retryable: true });
    }
  }
  const summary = await importGoogleSheets(req.auth!, { dryRun, batchSize: Number.isNaN(batchSize) ? 50 : batchSize, missingEnrollmentStrategy, requestId: req.requestId, onProgress: log });
  log("response_sent", { batchId: summary.batchId, status: summary.status, durationMs: summary.durationMs });
  // El importador es síncrono: ambos modos responden únicamente al finalizar.
  res.status(200).json(summary);
}));

// This intentionally is not the generic enrollment delete route. Its scope is
// constrained to the exact missing-row set produced by a Google Sheets batch.
router.post("/google-sheets/enrollments/delete-missing", requireImportFeature, asyncHandler(async (req, res) => {
  const input = parseMissingEnrollmentDeletion(req.body);
  if (!input) return res.status(400).json({ ok: false, message: "Debe seleccionar al menos una inscripción válida para eliminar." });
  const clubId = req.auth!.clubId;

  const pool = await getPostgresPool();
  const batch = await pool.query<{ id: string }>(
    "select id from miclub.import_batches where id = $1 and club_id = $2 and source = 'google_sheets' and status in ('completed', 'completed_with_errors')",
    [input.importId, clubId],
  );
  if (batch.rows.length === 0) return res.status(400).json({ error: true, message: "El import indicado no es una importación real de Google Sheets finalizada." });

  const client = await pool.connect();
  const errors: Array<{ id: string; message: string }> = [];
  let deletedIds: string[] = [];
  let phase = "begin_transaction";
  try {
    await client.query("begin");
    phase = "validate_candidates";
    const candidates = await client.query<{ id: string; dependency_reason: string | null }>(
      `select e.id,
              case
                when exists (
                  select 1
                    from miclub.payment_allocations pa
                    join miclub.receivables r on r.id = pa.receivable_id
                   where r.enrollment_id = e.id
                ) then 'La inscripción tiene pagos asociados y se conserva para no romper la integridad histórica.'
                when exists (select 1 from miclub.receivables r where r.enrollment_id = e.id)
                  then 'La inscripción tiene cuentas por cobrar asociadas y se conserva para no romper la integridad histórica.'
                when exists (select 1 from miclub.crm_message_history cmh where cmh.enrollment_id = e.id)
                  then 'La inscripción tiene historial de mensajes asociado y se conserva para no romper la integridad histórica.'
                else null
              end as dependency_reason
         from miclub.enrollments e
        where e.id = any($1::uuid[])
          and e.club_id = $3
          and e.source = 'google_sheets'
          and e.missing_from_import_batch_id = $2
        for update`,
      [input.enrollmentIds, input.importId, clubId],
    );
    const byId = new Map(candidates.rows.map((candidate) => [candidate.id, candidate]));
    const deletable: string[] = [];
    for (const id of input.enrollmentIds) {
      const candidate = byId.get(id);
      if (!candidate) errors.push({ id, message: "La inscripción no existe, no tiene origen Google Sheets o ya no está marcada como faltante para este import." });
      else if (candidate.dependency_reason) errors.push({ id, message: candidate.dependency_reason });
      else deletable.push(id);
    }

    if (deletable.length > 0) {
      phase = "delete_enrollments";
      const deleted = await client.query<{ id: string }>(
        `delete from miclub.enrollments
          where id = any($1::uuid[])
            and club_id = $3
            and source = 'google_sheets'
            and missing_from_import_batch_id = $2
          returning id`,
        [deletable, input.importId, clubId],
      );
      deletedIds = deleted.rows.map((row) => row.id);
      for (const id of deletable.filter((id) => !deletedIds.includes(id))) errors.push({ id, message: "La inscripción cambió antes de poder eliminarla; actualizá la revisión." });
    }
    phase = "commit_transaction";
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
    console.error("delete-missing enrollments failed", { endpoint: req.originalUrl, importId: input.importId, enrollmentIds: input.enrollmentIds, phase, code, message: error instanceof Error ? error.message : String(error) });
    const message = code === "23503"
      ? "No se pudo eliminar una o más inscripciones porque tienen datos relacionados. Actualizá la revisión e intentá nuevamente."
      : "No se pudieron eliminar las inscripciones seleccionadas. Intentá nuevamente.";
    return res.status(code === "23503" ? 409 : 500).json({ ok: false, message, deletedCount: 0, skippedCount: input.enrollmentIds.length, deletedIds: [], errors: input.enrollmentIds.map((id) => ({ id, message })) });
  } finally {
    client.release();
  }
  res.json({ ok: deletedIds.length > 0, deletedCount: deletedIds.length, skippedCount: errors.length, deletedIds, errors });
}));


router.get("/google-sheets/movements/audit", asyncHandler(async (req, res) => {
  res.json(await getMovementImportAudit(req.auth!));
}));

router.get("/batches", asyncHandler(async (req, res) => {
  const pool = await getPostgresPool();
  const { limit, offset } = parsePagination(req.query);
  const rows = await listImportBatches(pool, req.auth!.clubId, limit, offset);
  const total = Number((rows[0] as { total_count?: string | number } | undefined)?.total_count ?? 0);
  res.json({ rows, total, limit, offset });
}));

router.get("/batches/:id/errors", asyncHandler(async (req, res) => {
  const pool = await getPostgresPool();
  const { limit, offset } = parsePagination(req.query);
  const filters = {
    sheet: typeof req.query.sheet === "string" ? req.query.sheet.slice(0, 100) : undefined,
    entityType: typeof req.query.entity === "string" ? req.query.entity.slice(0, 50) : undefined,
  };
  const [rows, groups] = await Promise.all([
    listImportErrors(pool, req.auth!.clubId, String(req.params.id), limit, offset, filters),
    summarizeImportErrors(pool, req.auth!.clubId, String(req.params.id)),
  ]);
  const total = Number((rows[0] as { total_count?: string | number } | undefined)?.total_count ?? 0);
  res.json({ rows, groups, total, limit, offset });
}));

export default router;
