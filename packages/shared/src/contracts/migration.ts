export type SourceSheet = "FITNESS" | "SALON" | "AULA" | "LOCAL_1" | "CANTINA" | "ADMINISTRACION";

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
