import { apiUrl } from '../../api';

export type EndpointState<T> = {
  loading: boolean;
  error?: string;
  data?: T;
};

export type ImportSummary = {
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
  created_at?: string;
};

export type ImportErrorsResponse = {
  rows?: ImportError[];
  total?: number;
};

export const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error desconocido';

const fetchJson = async <T,>(path: `/${string}`, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiUrl(path), {
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    ...init
  });
  const payload = await response.json().catch(() => undefined) as T | { message?: string } | undefined;

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : undefined;
    throw new Error(message || `HTTP ${response.status}`);
  }

  return payload as T;
};

export const getDbHealth = () => fetchJson<unknown>('/api/db/health');

export const getSyncStatus = () => fetchJson<unknown>('/sync-status');

export const getImportBatches = (limit = 10) => fetchJson<ImportBatchesResponse>(`/api/import/batches?limit=${limit}` as `/${string}`);

export const runGoogleSheetsImport = (dryRun: boolean, batchSize = 50) => fetchJson<ImportSummary>('/api/import/google-sheets', {
  method: 'POST',
  body: JSON.stringify({ dryRun, batchSize })
});

export const deleteMissingInscriptions = (importId: string, enrollmentIds: string[]) => fetchJson<DeleteMissingInscriptionsResult>('/api/import/google-sheets/enrollments/delete-missing', {
  method: 'POST',
  body: JSON.stringify({ importId, enrollmentIds })
});

export const getImportBatchErrors = (batchId: string, limit = 100) => fetchJson<ImportErrorsResponse>(`/api/import/batches/${encodeURIComponent(batchId)}/errors?limit=${limit}` as `/${string}`);
