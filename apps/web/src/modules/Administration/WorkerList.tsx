import { PERMISSIONS, type AdministrationWorkerBalance, type AdministrationWorkerBalancesResponse, type AdministrationWorkerDto, type AdministrationWorkersResponse } from '@miclub/shared';
import { useCallback, useEffect, useState } from 'react';
import { archiveAdministrationWorker, createAdministrationWorker, getAdministrationWorkerBalances, getAdministrationWorkers, updateAdministrationWorker } from '../../services/api/administrationApi';
import { WorkerDetailModal } from './WorkerDetailModal';
import { useSession } from '../../session';

const date = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const statusLabel = (status: string) => ({
  active: 'Activo', inactive: 'Inactivo', on_leave: 'De licencia', terminated: 'Finalizado', archived: 'Archivado'
}[status] ?? status.replaceAll('_', ' '));

const startDate = (worker: AdministrationWorkerDto) => {
  if (!worker.employmentStartDate) return 'No disponible';
  const parsed = new Date(`${worker.employmentStartDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? worker.employmentStartDate : date.format(parsed);
};
const frequencyLabels: Record<string, string> = { DAILY: 'diario', WEEKLY: 'semanal', MONTHLY: 'mensual', YEARLY: 'anual' };
const roleLabels: Record<string, string> = { DIRECTOR: 'Director', INSTRUCTOR: 'Instructor', TRABAJADOR: 'Trabajador' };
const compensation = (worker: AdministrationWorkerDto) => worker.hasFixedCompensation && worker.fixedCompensationAmount != null && worker.currencyCode
  ? `${new Intl.NumberFormat('es-AR',{style:'currency',currency:worker.currencyCode}).format(worker.fixedCompensationAmount)} · ${frequencyLabels[worker.fixedCompensationFrequency ?? ''] ?? 'sin frecuencia'}`
  : 'Sin remuneración fija';
const money = (amount: number, currencyCode: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(Math.abs(amount));

function WorkerBalanceCell({ balance, loading, error }: { balance?: AdministrationWorkerBalance; loading: boolean; error: string | null }) {
  if (loading) return <span className="worker-list__balance-note">Calculando…</span>;
  if (error || !balance || balance.status === 'INCOMPLETE') return <span className="worker-list__balance-note" title={error || 'El circuito financiero informó datos incompletos.'}>No disponible</span>;
  if (!balance.amounts.length) return <span className="worker-list__balance-note">Sin saldo devengado</span>;
  const summary = balance.amounts.map(item => `${item.amount < 0 ? 'A cobrar' : 'A pagar'} ${money(item.amount, item.currencyCode)}${item.pendingReview ? ' · Pendiente de revisión' : ''}`).join('; ');
  const first = balance.amounts[0];
  return <span className="worker-list__balances" title={summary} aria-label={summary}><strong data-negative={first.amount < 0}>{first.amount < 0 ? 'A cobrar ' : 'A pagar '}{money(first.amount, first.currencyCode)}</strong>{balance.amounts.length > 1 ? <small>+{balance.amounts.length - 1} monedas · ver ficha</small> : first.pendingReview && <small>Pendiente de revisión</small>}</span>;
}

export function WorkerList() {
  const { permissions } = useSession();
  const canManage = permissions.includes(PERMISSIONS.WORKERS_MANAGE);
  const canViewBalances = permissions.includes(PERMISSIONS.FINANCE_READ);
  const [response, setResponse] = useState<AdministrationWorkersResponse | null>(null);
  const [balances, setBalances] = useState<AdministrationWorkerBalancesResponse | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setBalances(null);
    setBalanceError(null);
    setBalanceLoading(canViewBalances);
    try {
      const workers = await getAdministrationWorkers(signal, page, 20);
      if (signal?.aborted) return;
      if (page > 1 && workers.items.length === 0) { setPage(page - 1); return; }
      setResponse(workers);
      setLoadedPage(page);
      if (canViewBalances && workers.items.length) {
        try { setBalances(await getAdministrationWorkerBalances(page, signal)); }
        catch (balanceLoadError) { if (!signal?.aborted) setBalanceError(balanceLoadError instanceof Error ? balanceLoadError.message : 'No se pudo calcular el saldo.'); }
      }
    } catch (loadError) {
      if (!signal?.aborted) { setResponse(null); setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el equipo.'); }
    } finally {
      if (!signal?.aborted) { setLoading(false); setBalanceLoading(false); }
    }
  }, [canViewBalances, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer=window.setTimeout(()=>void load(controller.signal),0);
    return () => {window.clearTimeout(timer);controller.abort();};
  }, [load]);

  useEffect(() => {
    const openCreation = () => { if (canManage && response?.dataSource !== 'legacy') setCreating(true); };
    window.addEventListener('miclub:create-worker', openCreation);
    return () => window.removeEventListener('miclub:create-worker', openCreation);
  }, [canManage, response?.dataSource]);

  const workers = loadedPage === page ? response?.items ?? [] : [];
  const selectedWorker=workers.find(worker=>worker.id===selectedWorkerId)??null;
  const mutationsAvailable=response?.dataSource!=='legacy';
  return (
    <section className="section-panel worker-list" aria-labelledby="worker-list-title" aria-busy={loading}>
      <div className="section-header worker-list__header">
        <div><p className="eyebrow">Equipo</p><h3 id="worker-list-title">Trabajadores</h3><p>{response ? `${response.total} integrantes` : 'Información laboral y acceso al sistema.'}</p></div>
        <div>{canManage && response?.dataSource !== 'legacy' && <button className="primary-btn" type="button" onClick={() => setCreating(true)}>Nuevo trabajador</button>} <button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar equipo'}</button></div>
      </div>
      {response?.limitations.map((limitation) => <p className="worker-list__notice" key={limitation}>{limitation}</p>)}
      {error && <div className="sector-list__state sector-list__state--error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Reintentar</button></div>}
      {!error && loading && workers.length === 0 && <p className="sector-list__state" role="status">Cargando trabajadores…</p>}
      {!error && !loading && workers.length === 0 && <p className="sector-list__state">Todavía no hay trabajadores registrados.</p>}
      {workers.length > 0 && <div className="worker-list__table-wrap"><table className="worker-list__table" data-financial={canViewBalances}><colgroup><col/><col/><col/>{canViewBalances && <col/>}<col/><col/><col/></colgroup><thead><tr><th>Trabajador</th><th>Rol y sector</th><th>Remuneración</th>{canViewBalances && <th>Saldo a Liquidar</th>}<th>Estado</th><th>Acceso</th><th>Ingreso</th></tr></thead><tbody>{workers.map((worker) => <tr className="worker-list__row" key={worker.id} tabIndex={0} role="button" aria-label={`Ver ficha de ${worker.displayName}`} onClick={() => setSelectedWorkerId(worker.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedWorkerId(worker.id); } }}><td data-label="Trabajador" title={worker.displayName}><span className="worker-list__identity"><i aria-hidden="true">{worker.displayName.trim().slice(0,1).toUpperCase()}</i><strong>{worker.displayName}</strong></span></td><td data-label="Rol y sector"><span className="worker-list__stack"><strong>{roleLabels[worker.role ?? ''] ?? worker.role ?? 'Sin asignar'}</strong><small>{worker.sector || 'Sin sector'}</small></span></td><td data-label="Remuneración" title={compensation(worker)}>{compensation(worker)}</td>{canViewBalances && <td data-label="Saldo a Liquidar"><WorkerBalanceCell balance={balances?.items.find(item => item.workerId === worker.id)} loading={balanceLoading} error={balanceError}/></td>}<td data-label="Estado"><span className="worker-list__badge" data-active={worker.isActive}>{statusLabel(worker.status)}</span></td><td data-label="Acceso"><span className="worker-list__badge" data-active={worker.systemAccess}>{worker.systemAccess ? 'Habilitado' : 'Sin acceso'}</span></td><td data-label="Ingreso">{startDate(worker)}</td></tr>)}</tbody></table></div>}
      {balances?.scope === 'VISIBLE_SECTORS' && <p className="worker-list__notice">Los saldos incluyen sólo los sectores que podés consultar.</p>}
      {response && response.totalPages > 1 && <nav className="worker-list__pagination" aria-label="Páginas de trabajadores"><button type="button" className="ghost-btn" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {response.totalPages} · {response.total} trabajadores</span><button type="button" className="ghost-btn" disabled={loading || page >= response.totalPages} onClick={() => setPage(value => value + 1)}>Siguiente</button></nav>}
      {canManage&&mutationsAvailable&&creating&&<WorkerDetailModal onClose={()=>setCreating(false)} onSave={async input=>{await createAdministrationWorker(input);await load();}}/>}
      {selectedWorker&&<WorkerDetailModal key={`${selectedWorker.id}:${selectedWorker.version}`} worker={selectedWorker} balance={canViewBalances ? balances?.items.find(item => item.workerId === selectedWorker.id) : undefined} onClose={()=>setSelectedWorkerId(null)} onReload={async()=>{await load();}} onSave={canManage&&mutationsAvailable?async input=>{await updateAdministrationWorker(selectedWorker.id,input);await load();}:undefined} onArchive={canManage&&mutationsAvailable?async()=>{await archiveAdministrationWorker(selectedWorker.id,selectedWorker.version);await load();setSelectedWorkerId(null);}:undefined}/>}
    </section>
  );
}
