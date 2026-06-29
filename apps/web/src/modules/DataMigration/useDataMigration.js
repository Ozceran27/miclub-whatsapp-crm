import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDbHealth, getErrorMessage, getImportBatchErrors, getImportBatches, getSyncStatus, runGoogleSheetsImport } from '../../services/api/importApi';
export const getBatchId = (batch) => batch.id ?? batch.batch_id ?? '';
export const useDataMigration = () => {
    const [dbHealth, setDbHealth] = useState({ loading: true });
    const [syncStatus, setSyncStatus] = useState({ loading: true });
    const [batches, setBatches] = useState({ loading: true });
    const [lastDryRun, setLastDryRun] = useState(null);
    const [lastImport, setLastImport] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [isRunningDryRun, setIsRunningDryRun] = useState(false);
    const [isRunningImport, setIsRunningImport] = useState(false);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [batchErrors, setBatchErrors] = useState({ loading: false });
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
    const runImport = async (dryRun) => {
        setActionError(null);
        if (!dryRun) {
            const confirmed = window.confirm('Confirmá explícitamente la importación REAL a PostgreSQL. Esta acción persistirá cambios si la API valida la operación.');
            if (!confirmed)
                return;
        }
        if (dryRun)
            setIsRunningDryRun(true);
        else
            setIsRunningImport(true);
        try {
            const summary = await runGoogleSheetsImport(dryRun, 50);
            if (dryRun)
                setLastDryRun(summary);
            else
                setLastImport(summary);
            await loadStatus();
        }
        catch (error) {
            setActionError(getErrorMessage(error));
        }
        finally {
            setIsRunningDryRun(false);
            setIsRunningImport(false);
        }
    };
    const loadBatchErrors = async (batchId) => {
        setSelectedBatchId(batchId);
        if (!batchId) {
            setBatchErrors({ loading: false });
            return;
        }
        setBatchErrors({ loading: true });
        try {
            const errors = await getImportBatchErrors(batchId, 100);
            setBatchErrors({ loading: false, data: errors });
        }
        catch (error) {
            setBatchErrors({ loading: false, error: getErrorMessage(error) });
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
        canRunImport,
        loadStatus,
        runImport,
        loadBatchErrors
    };
};
