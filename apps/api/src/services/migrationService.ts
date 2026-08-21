import type { QueryExecutor } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { COMPLETED_IMPORT_BATCH, MISSING_FROM_IMPORT_BATCH, XLSX_IMPORT_SOURCE } from "@miclub/shared";
import { archiveEnrollmentsMissingFromImportBatch as archiveMissingEnrollmentRecords, isCompletedXlsxImportBatch, lockEnrollmentsMissingFromImportBatch } from "../repositories/migrationRepository.js";
import { auditService } from "./auditService.js";

export type ArchiveMissingFromImportBatchInput = { batchId: string; enrollmentIds: string[] };
export type ArchiveMissingFromImportBatchContext = { clubId: string; userId: string; membershipId: string; requestId?: string; ip?: string; userAgent?: string };
export type ArchiveMissingFromImportBatchResult = { ok: boolean; archivedCount: number; skippedCount: number; archivedIds: string[]; errors: Array<{ id: string; message: string }> };

export class InvalidMigrationBatchError extends Error {}

type Dependencies = {
  transaction?: typeof withTransaction;
  audit?: typeof auditService.enrollment;
};

export const archiveEnrollmentsMissingFromImportBatch = async (
  input: ArchiveMissingFromImportBatchInput,
  context: ArchiveMissingFromImportBatchContext,
  dependencies: Dependencies = {},
): Promise<ArchiveMissingFromImportBatchResult> => {
  const transaction = dependencies.transaction ?? withTransaction;
  const audit = dependencies.audit ?? auditService.enrollment;

  return transaction(async (executor: QueryExecutor) => {
    if (!await isCompletedXlsxImportBatch(executor, input.batchId, context.clubId)) {
      throw new InvalidMigrationBatchError("El lote indicado no es una importación XLSX finalizada.");
    }

    const candidates = await lockEnrollmentsMissingFromImportBatch(executor, input.enrollmentIds, input.batchId, context.clubId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const errors: ArchiveMissingFromImportBatchResult["errors"] = [];
    const deletable: string[] = [];
    for (const id of input.enrollmentIds) {
      const candidate = byId.get(id);
      if (!candidate) errors.push({ id, message: "La inscripción no existe, no pertenece al lote XLSX o ya no está marcada como faltante para este lote." });
      else deletable.push(id);
    }

    const deletedIds = deletable.length > 0
      ? await archiveMissingEnrollmentRecords(executor, deletable, input.batchId, context.clubId)
      : [];
    for (const id of deletable.filter((id) => !deletedIds.includes(id))) {
      errors.push({ id, message: "La inscripción cambió antes de poder eliminarla; actualizá la revisión." });
    }

    await audit({
      action: "xlsx_import.enrollments.archive_missing",
      result: "success",
      userId: context.userId,
      clubId: context.clubId,
      membershipId: context.membershipId,
      entityType: "xlsx_import_batch",
      entityId: input.batchId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { requestedEnrollmentIds: input.enrollmentIds, archivedEnrollmentIds: deletedIds, importBatchId: input.batchId, source: XLSX_IMPORT_SOURCE, batchState: COMPLETED_IMPORT_BATCH, reason: MISSING_FROM_IMPORT_BATCH, skippedCount: errors.length },
    }, executor);

    return { ok: deletedIds.length > 0, archivedCount: deletedIds.length, skippedCount: errors.length, archivedIds: deletedIds, errors };
  });
};
