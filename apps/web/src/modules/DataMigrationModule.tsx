import { type EndpointState, type ImportSummary } from '../services/api/importApi';
import { getBatchId, useDataMigration } from './DataMigration/useDataMigration';

const SUMMARY_FIELDS: Array<{ key: keyof ImportSummary; label: string }> = [
  { key: 'read', label: 'Filas leídas' },
  { key: 'errors', label: 'Errores' },
  { key: 'warnings', label: 'Advertencias' },
  { key: 'attemptedWrites', label: 'Writes intentados' },
  { key: 'persistedWrites', label: 'Writes persistidos' },
  { key: 'rolledBackWrites', label: 'Writes revertidos' },
  { key: 'enrollmentsProcessed', label: 'Inscripciones procesadas' },
  { key: 'movementsProcessed', label: 'Movimientos procesados' }
];

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const JsonPanel = ({ title, state }: { title: string; state: EndpointState<unknown> }) => (
  <article className="card migration-status-card">
    <h4>{title}</h4>
    {state.loading && <p className="section-note">Cargando…</p>}
    {state.error && <p className="error-msg">{state.error}</p>}
    {state.data !== undefined && <pre className="migration-json">{JSON.stringify(state.data, null, 2)}</pre>}
  </article>
);

const renderSummary = (summary: ImportSummary | null, title: string) => (
  <article className="card migration-summary-card">
    <h4>{title}</h4>
    {!summary ? <p className="section-note">Sin ejecución registrada en esta sesión.</p> : (
      <>
        <p className="section-note">Batch: {summary.batchId ?? '—'} · Modo: {summary.dryRun ? 'dry-run' : 'real'}</p>
        <dl className="migration-summary-grid">
          {SUMMARY_FIELDS.map(({ key, label }) => (
            <div key={key} className="migration-summary-item">
              <dt>{label}</dt>
              <dd>{formatValue(summary[key])}</dd>
            </div>
          ))}
        </dl>
        {Array.isArray(summary.warnings) && summary.warnings.length > 0 && (
          <ul className="migration-warning-list">{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        )}
      </>
    )}
  </article>
);

export default function DataMigrationModule() {
  const {
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
  } = useDataMigration();
  return (
    <main className="module-content">
      <section className="module-hero">
        <div>
          <p className="eyebrow">Migración controlada</p>
          <h2>Panel temporal de importación</h2>
          <p>Uso interno durante la ventana operativa de Google Sheets a PostgreSQL.</p>
        </div>
        <button className="icon-btn" type="button" onClick={() => void loadStatus()}>Actualizar estado</button>
      </section>

      <section className="section-panel migration-alert">
        <strong>Requisito operativo:</strong> los endpoints de importación requieren <code>IMPORT_ENDPOINTS_ENABLED=true</code> únicamente durante una ventana controlada. Volver a <code>false</code> al finalizar.
      </section>

      {actionError && <p className="error-msg">Error de operación: {actionError}</p>}

      <section className="migration-status-grid" aria-label="Estado actual de servicios">
        <JsonPanel title="GET /api/db/health" state={dbHealth} />
        <JsonPanel title="GET /sync-status" state={syncStatus} />
        <JsonPanel title="GET /api/import/batches?limit=10" state={batches as EndpointState<unknown>} />
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Operaciones de importación</h3>
            <p>Primero ejecutar dry-run; la importación real se habilita solo con cero errores.</p>
          </div>
          <div className="actions-row">
            <button type="button" onClick={() => void runImport(true)} disabled={isRunningDryRun || isRunningImport}>Ejecutar dry-run</button>
            <button type="button" onClick={() => void runImport(false)} disabled={!canRunImport || isRunningDryRun || isRunningImport}>Ejecutar importación real</button>
          </div>
        </div>
        {!canRunImport && <p className="section-note">La importación real queda bloqueada hasta que el último dry-run de esta sesión tenga <strong>errors === 0</strong>.</p>}
        <div className="migration-summary-stack">
          {renderSummary(lastDryRun, 'Resumen del último dry-run')}
          {renderSummary(lastImport, 'Resumen de la última importación real')}
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Errores por batch</h3>
            <p>Seleccioná un batch reciente para consultar <code>GET /api/import/batches/:id/errors</code>.</p>
          </div>
          <select value={selectedBatchId} onChange={(event) => void loadBatchErrors(event.target.value)}>
            <option value="">Seleccionar batch…</option>
            {batches.data?.rows?.map((batch) => {
              const id = getBatchId(batch);
              return <option key={id} value={id}>{id} · {batch.status ?? 'sin estado'}</option>;
            })}
          </select>
        </div>
        {selectedBatch && <p className="section-note">Batch seleccionado: {getBatchId(selectedBatch)} · Inicio: {formatDateTime(selectedBatch.started_at)} · Fin: {formatDateTime(selectedBatch.finished_at)}</p>}
        {batchErrors.loading && <p className="section-note">Cargando errores…</p>}
        {batchErrors.error && <p className="error-msg">{batchErrors.error}</p>}
        {batchErrors.data && (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead><tr><th>Fila</th><th>Origen</th><th>Severidad</th><th>Mensaje</th><th>Detalles</th></tr></thead>
              <tbody>
                {(batchErrors.data.rows ?? []).map((error, index) => (
                  <tr key={error.id ?? index}>
                    <td>{formatValue(error.row_number)}</td>
                    <td>{formatValue(error.source)}</td>
                    <td>{formatValue(error.severity)}</td>
                    <td>{formatValue(error.message)}</td>
                    <td><pre className="migration-json migration-json--inline">{formatValue(error.details)}</pre></td>
                  </tr>
                ))}
                {(batchErrors.data.rows ?? []).length === 0 && <tr><td colSpan={5}>Sin errores registrados para este batch.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
