import { apiFetch, readApiError } from '../../api';
import type { ImportFailureResponse } from '@miclub/shared';

export type EndpointState<T> = {
  loading: boolean;
  error?: string;
  data?: T;
};

export type ImportSummary = {
  ok?: true;
  batchId?: string;
  dryRun?: boolean;
  read?: number;
  errors?: number;
  warnings?: string[] | number;
  attemptedWrites?: number;
  persistedWrites?: number;
  rolledBackWrites?: number;
  enrollmentsProcessed?: number;
  movementsProcessed?: number;
  missingEnrollments?: number;
  missingInscriptions?: MissingInscription[];
  mode?: 'dry-run' | 'real';
  status?: 'COMPLETED' | 'COMPLETED_WITH_ERRORS';
  rowsRead?: number;
  writesAttempted?: number;
  writesPersisted?: number;
  writesReverted?: number;
  durationMs?: number;
  warningMessages?: string[];
  rowsFetched?: number;
  rowsDetected?: number;
  rowsSkippedEmpty?: number;
  rowsValid?: number;
  rowsInvalid?: number;
  operationalWritesAttempted?: number;
  metadataWrites?: number;
  rowsBySheet?: Record<string, { rowsFetched: number; rowsDetected: number; rowsSkippedEmpty: number; membersDetected: number; movementsDetected: number }>;
};

export type MissingInscription = {
  id: string;
  name: string;
  dni: string | null;
  sector: string | null;
  activity: string | null;
  enrollmentDate: string | null;
  feeAmount: number;
  status: string | null;
  source: 'google_sheets';
  reason: 'missing_from_latest_import';
};

export type DeleteMissingInscriptionsResult = {
  ok: boolean;
  deletedCount: number;
  skippedCount: number;
  deletedIds: string[];
  errors: Array<{ id: string; message: string }>;
};

export type ImportBatch = {
  id?: string;
  batch_id?: string;
  dry_run?: boolean;
  status?: string;
  started_at?: string;
  finished_at?: string;
  errors?: number;
  warnings?: string[] | number;
  read?: number;
  persisted_writes?: number;
  rolled_back_writes?: number;
  total_count?: string | number;
};

export type ImportBatchesResponse = {
  rows?: ImportBatch[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type ImportError = {
  id?: string;
  row_number?: number;
  source?: string;
  severity?: string;
  message?: string;
  details?: unknown;
  error_code?: string;
  entity_type?: string;
  sheet?: string;
  metadata?: unknown;
  created_at?: string;
};

export type ImportErrorsResponse = {
  rows?: ImportError[];
  groups?: Array<{ error_code: string; entity_type: string; sheet: string; message: string; count: number }>;
  total?: number;
  limit?: number;
  offset?: number;
};

export const getErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return 'Error desconocido';
  const requestId = error instanceof ApiErrorWithRequestId ? error.requestId : undefined;
  return requestId ? `${error.message} (requestId: ${requestId})` : error.message;
};

class ApiErrorWithRequestId extends Error {
  constructor(message: string, readonly payload: ImportFailureResponse) { super(message); }
  get requestId() { return this.payload.requestId; }
}

export const getImportFailure = (error: unknown): ImportFailureResponse | null =>
  error instanceof ApiErrorWithRequestId ? error.payload : null;

const fetchJson = async <T,>(path: `/${string}`, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    ...init
  });
  if (!response.ok) {
    const body = await response.clone().json().catch(() => undefined) as Partial<ImportFailureResponse> | undefined;
    const apiError = await readApiError(response);
    const requestId = body?.requestId ?? response.headers.get('x-request-id') ?? undefined;
    const payload: ImportFailureResponse = {
      ok: false,
      code: body?.code ?? apiError.code ?? 'IMPORT_FAILED',
      message: body?.message ?? apiError.message,
      batchId: body?.batchId,
      requestId,
      retryable: body?.retryable ?? response.status >= 500,
      details: body?.details
    };
    throw new ApiErrorWithRequestId(payload.message, payload);
  }
  const payload = await response.json().catch(() => undefined) as T | undefined;

  return payload as T;
};

export const getDbHealth = () => fetchJson<unknown>('/api/db/health');

export const getSyncStatus = () => fetchJson<unknown>('/sync-status');

export const getImportBatches = (limit = 10) => fetchJson<ImportBatchesResponse>(`/api/import/batches?limit=${limit}` as `/${string}`);

export const runGoogleSheetsImport = async (dryRun: boolean, batchSize = 50) => {
  const controller = new AbortController();
  const timeoutMs = 120_000;
  const timer = window.setTimeout(() => controller.abort(new Error(`La importación superó el límite de ${timeoutMs / 1000} segundos.`)), timeoutMs);
  try {
    return await fetchJson<ImportSummary>('/api/import/google-sheets', {
      method: 'POST', body: JSON.stringify({ dryRun, batchSize }), signal: controller.signal
    });
  } finally {
    window.clearTimeout(timer);
  }
};

export const deleteMissingInscriptions = (importId: string, enrollmentIds: string[]) => fetchJson<DeleteMissingInscriptionsResult>('/api/import/google-sheets/enrollments/delete-missing', {
  method: 'POST',
  body: JSON.stringify({ importId, enrollmentIds })
});

export const getImportBatchErrors = (batchId: string, limit = 25, offset = 0, filters: { sheet?: string; entity?: string } = {}) => {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.sheet) query.set('sheet', filters.sheet);
  if (filters.entity) query.set('entity', filters.entity);
  return fetchJson<ImportErrorsResponse>(`/api/import/batches/${encodeURIComponent(batchId)}/errors?${query}` as `/${string}`);
};
