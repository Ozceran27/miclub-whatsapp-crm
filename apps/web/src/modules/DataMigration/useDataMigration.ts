import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getDbHealth,
  deleteMissingInscriptions,
  getErrorMessage,
  getImportBatchErrors,
  getImportBatches,
  getSyncStatus,
  runGoogleSheetsImport,
  type EndpointState,
  type ImportBatch,
  type ImportBatchesResponse,
  type ImportErrorsResponse,
  type ImportSummary
} from '../../services/api/importApi';

export const getBatchId = (batch: ImportBatch) => batch.id ?? batch.batch_id ?? '';

export const useDataMigration = () => {
  const [dbHealth, setDbHealth] = useState<EndpointState<unknown>>({ loading: true });
  const [syncStatus, setSyncStatus] = useState<EndpointState<unknown>>({ loading: true });
  const [batches, setBatches] = useState<EndpointState<ImportBatchesResponse>>({ loading: true });
  const [lastDryRun, setLastDryRun] = useState<ImportSummary | null>(null);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRunningDryRun, setIsRunningDryRun] = useState(false);
  const [isRunningImport, setIsRunningImport] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [batchErrors, setBatchErrors] = useState<EndpointState<ImportErrorsResponse>>({ loading: false });
  const [isDeletingMissing, setIsDeletingMissing] = useState(false);
  const [missingDeletionResult, setMissingDeletionResult] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setDbHealth({ loading: true });
    setSyncStatus({ loading: true });
    setBatches({ loading: true });

    const [healthResult, syncResult, batchesResult] = await Promise.allSettled([
      getDbHealth(),
      getSyncStatus(),
      getImportBatches(10)
    ]);

    setDbHealth(healthResult.status === 'fulfilled' ? { loading: false, data: healthResult.value } : { loading: false, error: getErrorMessage(healthResult.reason) });
    setSyncStatus(syncResult.status === 'fulfilled' ? { loading: false, data: syncResult.value } : { loading: false, error: getErrorMessage(syncResult.reason) });
    setBatches(batchesResult.status === 'fulfilled' ? { loading: false, data: batchesResult.value } : { loading: false, error: getErrorMessage(batchesResult.reason) });
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const canRunImport = (lastDryRun?.errors ?? Number.POSITIVE_INFINITY) === 0;

  const selectedBatch = useMemo(() => batches.data?.rows?.find((batch) => getBatchId(batch) === selectedBatchId), [batches.data?.rows, selectedBatchId]);

  const runImport = async (dryRun: boolean) => {
    setActionError(null);
    if (!dryRun) {
      const confirmed = window.confirm('Confirmá explícitamente la importación REAL a PostgreSQL. Esta acción persistirá cambios si la API valida la operación.');
      if (!confirmed) return;
    }

    if (dryRun) setIsRunningDryRun(true);
    else setIsRunningImport(true);

    try {
      const summary = await runGoogleSheetsImport(dryRun, 50);
      if (dryRun) setLastDryRun(summary);
      else setLastImport(summary);
      await loadStatus();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsRunningDryRun(false);
      setIsRunningImport(false);
    }
  };

  const loadBatchErrors = async (batchId: string) => {
    setSelectedBatchId(batchId);
    if (!batchId) {
      setBatchErrors({ loading: false });
      return;
    }
    setBatchErrors({ loading: true });
    try {
      const errors = await getImportBatchErrors(batchId, 100);
      setBatchErrors({ loading: false, data: errors });
    } catch (error) {
      setBatchErrors({ loading: false, error: getErrorMessage(error) });
    }
  };

  const deleteSelectedMissing = async (enrollmentIds: string[]) => {
    if (!lastImport?.batchId || enrollmentIds.length === 0) return { deletedIds: [] };
    setActionError(null);
    setMissingDeletionResult(null);
    setIsDeletingMissing(true);
    try {
      const result = await deleteMissingInscriptions(lastImport.batchId, enrollmentIds);
      setLastImport((current) => current ? {
        ...current,
        missingInscriptions: (current.missingInscriptions ?? []).filter((item) => !result.deletedIds.includes(item.id)),
        missingEnrollments: Math.max(0, (current.missingEnrollments ?? 0) - result.deletedIds.length)
      } : current);
      setMissingDeletionResult(result.errors.length > 0
        ? `${result.deletedCount} inscripciones eliminadas. ${result.skippedCount} no pudieron eliminarse.`
        : `${result.deletedCount} inscripciones eliminadas correctamente.`);
      await loadStatus();
      return result;
    } catch (error) {
      setActionError(getErrorMessage(error));
      return { deletedIds: [] };
    } finally {
      setIsDeletingMissing(false);
    }
  };

  return {
    dbHealth,
    syncStatus,
    batches,
    lastDryRun,
    lastImport,
    actionError,
    isRunningDryRun,
    isRunningImport,
    selectedBatchId,
    selectedBatch,
    batchErrors,
    isDeletingMissing,
    missingDeletionResult,
    canRunImport,
    loadStatus,
    runImport,
    loadBatchErrors,
    deleteSelectedMissing
  };
};
