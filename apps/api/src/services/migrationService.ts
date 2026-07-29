import type { QueryExecutor } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { archiveMissingEnrollments, isCompletedGoogleSheetsImport, lockMissingEnrollments } from "../repositories/migrationRepository.js";
import { auditService } from "./auditService.js";

export type DeleteMissingEnrollmentInput = { importId: string; enrollmentIds: string[] };
export type DeleteMissingEnrollmentContext = { clubId: string; userId: string; membershipId: string; requestId?: string; ip?: string; userAgent?: string };
export type DeleteMissingEnrollmentResult = { ok: boolean; deletedCount: number; skippedCount: number; deletedIds: string[]; errors: Array<{ id: string; message: string }> };

export class InvalidMigrationBatchError extends Error {}

type Dependencies = {
  transaction?: typeof withTransaction;
  audit?: typeof auditService.enrollment;
};

export const removeMissingEnrollments = async (
  input: DeleteMissingEnrollmentInput,
  context: DeleteMissingEnrollmentContext,
  dependencies: Dependencies = {},
): Promise<DeleteMissingEnrollmentResult> => {
  const transaction = dependencies.transaction ?? withTransaction;
  const audit = dependencies.audit ?? auditService.enrollment;

  return transaction(async (executor: QueryExecutor) => {
    if (!await isCompletedGoogleSheetsImport(executor, input.importId, context.clubId)) {
      throw new InvalidMigrationBatchError("El import indicado no es una importación real de Google Sheets finalizada.");
    }

    const candidates = await lockMissingEnrollments(executor, input.enrollmentIds, input.importId, context.clubId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const errors: DeleteMissingEnrollmentResult["errors"] = [];
    const deletable: string[] = [];
    for (const id of input.enrollmentIds) {
      const candidate = byId.get(id);
      if (!candidate) errors.push({ id, message: "La inscripción no existe, no tiene origen Google Sheets o ya no está marcada como faltante para este import." });
      else deletable.push(id);
    }

    const deletedIds = deletable.length > 0
      ? await archiveMissingEnrollments(executor, deletable, input.importId, context.clubId)
      : [];
    for (const id of deletable.filter((id) => !deletedIds.includes(id))) {
      errors.push({ id, message: "La inscripción cambió antes de poder eliminarla; actualizá la revisión." });
    }

    await audit({
      action: "migration.enrollments.archive_missing",
      result: "success",
      userId: context.userId,
      clubId: context.clubId,
      membershipId: context.membershipId,
      entityType: "import_batch",
      entityId: input.importId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { requestedEnrollmentIds: input.enrollmentIds, archivedEnrollmentIds: deletedIds, importBatchId: input.importId, reason: "missing_from_google_sheets_import", skippedCount: errors.length },
    }, executor);

    return { ok: deletedIds.length > 0, deletedCount: deletedIds.length, skippedCount: errors.length, deletedIds, errors };
  });
};
