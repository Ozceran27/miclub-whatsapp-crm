import { apiUrl } from '../../api';
export const getErrorMessage = (error) => error instanceof Error ? error.message : 'Error desconocido';
const fetchJson = async (path, init) => {
    const response = await fetch(apiUrl(path), {
        headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
        ...init
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : undefined;
        throw new Error(message || `HTTP ${response.status}`);
    }
    return payload;
};
export const getDbHealth = () => fetchJson('/api/db/health');
export const getSyncStatus = () => fetchJson('/sync-status');
export const getImportBatches = (limit = 10) => fetchJson(`/api/import/batches?limit=${limit}`);
export const runGoogleSheetsImport = (dryRun, batchSize = 50) => fetchJson('/api/import/google-sheets', {
    method: 'POST',
    body: JSON.stringify({ dryRun, batchSize })
});
export const getImportBatchErrors = (batchId, limit = 100) => fetchJson(`/api/import/batches/${encodeURIComponent(batchId)}/errors?limit=${limit}`);
