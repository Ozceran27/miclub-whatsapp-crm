export type SourceSheet = "FITNESS" | "SALON" | "AULA" | "LOCAL_1" | "CANTINA" | "ADMINISTRACION";

/** Canonical vocabulary emitted by the XLSX import runtime. */
export const XLSX_IMPORT_SOURCE = "xlsx_import" as const;
export const COMPLETED_IMPORT_BATCH = "completed_import_batch" as const;
export const MISSING_FROM_IMPORT_BATCH = "missing_from_import_batch" as const;

export type XlsxImportSource = typeof XLSX_IMPORT_SOURCE;
export type CompletedImportBatchState = typeof COMPLETED_IMPORT_BATCH;
export type MissingFromImportBatchReason = typeof MISSING_FROM_IMPORT_BATCH;

export type ImportFailureCode =
  | "IMPORT_SCHEMA_PRECONDITION_FAILED"
  | "IMPORT_SCHEMA_CONFLICT_CONFIGURATION"
  | "IMPORT_SOURCE_FAILED"
  | "IMPORT_DATABASE_FAILED"
  | "IMPORT_VALIDATION_FAILED"
  | "IMPORT_FAILED";

export type LegacyImportFailureCode = import("./legacy.js").LegacyUnknownCode<"import-error">;

export type ImportFailureResponse = {
  ok: false;
  code: ImportFailureCode | LegacyImportFailureCode;
  message: string;
  batchId?: string;
  requestId?: string;
  retryable: boolean;
  details?: Array<{
    entity?: string;
    requiredConflictTarget?: string[];
    requiredPredicate?: string;
    compatibleConstraintFound?: boolean;
  }>;
};

export type ImportSuccessResponse<TSummary> = TSummary & { ok: true };
export type ImportResponse<TSummary> = ImportSuccessResponse<TSummary> | ImportFailureResponse;
