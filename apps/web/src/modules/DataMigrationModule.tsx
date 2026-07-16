import { useEffect, useState } from 'react';
import { type EndpointState, type ImportSummary, type MissingInscription } from '../services/api/importApi';
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

const formatMoney = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);

const MissingInscriptionsReview = ({ items, deleting, result, onDelete }: { items: MissingInscription[]; deleting: boolean; result: string | null; onDelete: (ids: string[]) => Promise<{ deletedIds: string[] }> }) => {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected((current) => current.filter((id) => items.some((item) => item.id === id))), [items]);
  if (items.length === 0) return null;
  const allSelected = selected.length === items.length;
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((currentId) => currentId !== id) : [...current, id]);
  const remove = async () => {
    if (!window.confirm(`Vas a eliminar ${selected.length} inscripciones de la base de datos. Esta acción puede afectar cálculos económicos, métricas e historial. ¿Querés continuar?`)) return;
    const response = await onDelete(selected);
    setSelected((current) => current.filter((id) => !response.deletedIds.includes(id)));
  };
  return <article className="card missing-inscriptions-review">
    <h4>Inscripciones no encontradas en el último import</h4>
    <p className="section-note">Estas inscripciones existen en la base de datos con origen Google Sheets, pero no aparecieron en el último import. Podés conservarlas o seleccionarlas para eliminarlas.</p>
    <div className="actions-row missing-inscriptions-review__actions">
      <button type="button" onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))} disabled={deleting}>{allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}</button>
      <span className="section-note">{selected.length} seleccionadas</span>
      <button type="button" className="danger-btn" onClick={() => void remove()} disabled={deleting || selected.length === 0}>{deleting ? 'Eliminando seleccionadas…' : 'Eliminar seleccionadas'}</button>
      <button type="button" onClick={() => setSelected([])} disabled={deleting}>Conservar todas</button>
    </div>
    {result && <p className="section-note">{result}</p>}
    <div className="missing-inscriptions-review__list">
      {items.map((item) => <label className="missing-inscriptions-review__row" key={item.id}>
        <input type="checkbox" checked={selected.includes(item.id)} disabled={deleting} onChange={() => toggle(item.id)} />
        <span><strong>{item.name}</strong> · DNI {item.dni || '—'} · {item.sector || 'Sin sector'} · {item.activity || 'Sin actividad'} · {item.enrollmentDate || 'Sin fecha'} · {formatMoney(item.feeAmount)} · {item.status || 'Sin estado'}</span>
      </label>)}
    </div>
  </article>;
};

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
    isDeletingMissing,
    missingDeletionResult,
    canRunImport,
    loadStatus,
    runImport,
    loadBatchErrors,
    deleteSelectedMissing
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
          {lastImport && <MissingInscriptionsReview items={lastImport.missingInscriptions ?? []} deleting={isDeletingMissing} result={missingDeletionResult} onDelete={deleteSelectedMissing} />}
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
