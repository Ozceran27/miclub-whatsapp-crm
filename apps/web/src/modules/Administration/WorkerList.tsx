import type { AdministrationWorkerDto, AdministrationWorkersResponse } from '@miclub/shared';
import { useCallback, useEffect, useState } from 'react';
import { getAdministrationWorkers } from '../../services/api/administrationApi';
import { WorkerDetailModal } from './WorkerDetailModal';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const statusLabel = (status: string) => ({
  active: 'Activo', inactive: 'Inactivo', on_leave: 'De licencia', terminated: 'Finalizado', archived: 'Archivado'
}[status] ?? status.replaceAll('_', ' '));

const startDate = (worker: AdministrationWorkerDto) => {
  if (!worker.employmentStartDate) return 'No disponible';
  const parsed = new Date(`${worker.employmentStartDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? worker.employmentStartDate : date.format(parsed);
};

export function WorkerList() {
  const [response, setResponse] = useState<AdministrationWorkersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<AdministrationWorkerDto | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await getAdministrationWorkers(signal));
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el equipo.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const workers = response?.items ?? [];
  return (
    <section className="section-panel worker-list" aria-labelledby="worker-list-title" aria-busy={loading}>
      <div className="section-header worker-list__header">
        <div><p className="eyebrow">Equipo</p><h3 id="worker-list-title">Trabajadores</h3><p>{response ? `${response.total} integrantes` : 'Información laboral y acceso al sistema.'}</p></div>
        <button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar equipo'}</button>
      </div>
      {response?.limitations.map((limitation) => <p className="worker-list__notice" key={limitation}>{limitation}</p>)}
      {error && <div className="sector-list__state sector-list__state--error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Reintentar</button></div>}
      {!error && loading && workers.length === 0 && <p className="sector-list__state" role="status">Cargando trabajadores…</p>}
      {!error && !loading && workers.length === 0 && <p className="sector-list__state">Todavía no hay trabajadores registrados.</p>}
      {workers.length > 0 && <div className="worker-list__table-wrap"><table className="worker-list__table"><thead><tr><th>Nombre</th><th>Rol</th><th>Sector</th><th>Salario</th><th>Estado</th><th>Acceso al sistema</th><th>Fecha de ingreso</th></tr></thead><tbody>{workers.map((worker) => <tr className="worker-list__row" key={worker.id} tabIndex={0} role="button" aria-label={`Ver ficha de ${worker.displayName}`} onClick={() => setSelectedWorker(worker)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedWorker(worker); } }}><td><strong>{worker.displayName}</strong></td><td>{worker.role || 'Sin asignar'}</td><td>{worker.sector || 'Sin asignar'}</td><td>{worker.salary == null ? 'No disponible' : money.format(worker.salary)}</td><td><span className="worker-list__badge" data-active={worker.isActive}>{statusLabel(worker.status)}</span></td><td><span className="worker-list__badge" data-active={worker.systemAccess}>{worker.systemAccess ? 'Habilitado' : 'Sin acceso'}</span></td><td>{startDate(worker)}</td></tr>)}</tbody></table></div>}
      {selectedWorker && <WorkerDetailModal worker={selectedWorker} onClose={() => setSelectedWorker(null)} />}
    </section>
  );
}
