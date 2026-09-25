import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { PERMISSIONS, type EmployeeCompensationObligation, type FinancialCircuit, type PersistedSettlement } from '@miclub/shared';
import { apiJson } from '../../api';
import { useSession } from '../../session';
import { useServerQuery } from '../../serverState/client';
import { queryKey } from '../../serverState/queryKeys';
import { policies } from '../../serverState/policies';
import { invalidateTenantQueries } from '../../serverState/invalidation';
import { useModalAccessibility } from '../Administration/useModalAccessibility';
import './financialCircuit.css';

type Option = { id: string; name: string };
type OpeningObligation = { id?: string; reviewState?: string; balance?: number; sourceKey: string; personId: string; activityId: string; kind: string; currencyCode: string; amount: number; dueDate: string };
const formText = (form: FormData, key: string): string => { const value = form.get(key); return typeof value === 'string' ? value : ''; };
type Workbench = { initialObligations: OpeningObligation[]; categories: (Option & { code: string; classification: string })[]; sectors: Option[]; methods: Option[]; activities: (Option & { sectorId: string })[]; startup: { revision: number; status: string; mode: string; cutoffDate: string; preview: { accounts?: { accountId: string; amount: number }[]; obligations?: OpeningObligation[]; differences: { accountId: string; expected: number; imported: number; difference: number }[] } } | null };
type OpeningBalances = { batch: { id:string; revision:number; operation:string; status:string; reconciliationStatus:string; createdAt:string } | null; movements: { id:string; accountCode:string; amount:number; currencyCode:string; reversesMovementId:string|null }[]; revisions: { id:string; reason:string; actorId:string; createdAt:string; previousSnapshot:unknown; replacementSnapshot:unknown }[] };
type FinanceTab = 'overview'|'settlements'|'compensation'|'reconciliation';
const financeTabs: readonly [FinanceTab, string][] = [['overview','Resumen'],['settlements','Liquidaciones'],['compensation','Remuneraciones'],['reconciliation','Conciliación']];
const openAdministrationArea = (id: 'movement-list'|'enrollment-list') => {
  const target = document.getElementById(id);
  if (!target) return;
  window.history.replaceState(null, '', `#${id}`);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
};
const money = (value: number | null, currency: string) => value === null ? 'No disponible' : new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(value);
const select = (name: string, label: string, options: Option[], required = true, value = '') => <label>{label}<select name={name} required={required} defaultValue={value}><option value="">Seleccionar…</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;

export function FinancialCircuitPanel({ summaryOnly = false }: { summaryOnly?: boolean }) {
  const { permissions } = useSession();
  return permissions.includes(PERMISSIONS.FINANCE_READ) ? <FinancialCircuitContent summaryOnly={summaryOnly} /> : null;
}

function FinancialCircuitContent({ summaryOnly = false }: { summaryOnly?: boolean }) {
  const { clubId, permissions } = useSession();
  const [month, setMonth] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<FinanceTab>('overview');
  const tabsRef = useRef<(HTMLButtonElement|null)[]>([]);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % financeTabs.length : event.key === 'ArrowLeft' ? (index + financeTabs.length - 1) % financeTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? financeTabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(financeTabs[next][0]); tabsRef.current[next]?.focus();
  };
  const [search, setSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState('ALL');
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [selectedCompensationId, setSelectedCompensationId] = useState<string | null>(null);
  const [selectedGroupId,setSelectedGroupId]=useState<string|null>(null);
  const [processingOpen,setProcessingOpen]=useState(false);
  const operationKeys = useRef(new Map<string, string>());
  const fetchCircuit = useCallback(({ signal }: { signal: AbortSignal }) => apiJson<FinancialCircuit>(`/api/finance/circuit${month ? `?month=${month}` : ''}`, { signal }), [month]);
  const circuit = useServerQuery({ key: queryKey({ clubId, resource: 'financial-circuit', filters: { month } }), queryFn: fetchCircuit, policy: policies.dashboard });
  const fetchWorkbench = useCallback(({ signal }: { signal: AbortSignal }) => summaryOnly ? Promise.resolve(null) : apiJson<Workbench>('/api/finance/workbench', { signal }), [summaryOnly]);
  const workbench = useServerQuery({ key: queryKey({ clubId, resource: 'financial-workbench', filters: { summaryOnly } }), queryFn: fetchWorkbench, policy: policies.paginated });
  const canReconcile = permissions.includes(PERMISSIONS.FINANCE_RECONCILE) && permissions.includes(PERMISSIONS.SECTORS_ANY) && !summaryOnly;
  const fetchOpening = useCallback(({ signal }: { signal: AbortSignal }) => canReconcile ? apiJson<OpeningBalances>('/api/finance/opening-balances', { signal }) : Promise.resolve(null), [canReconcile]);
  const opening = useServerQuery({ key: queryKey({ clubId, resource: 'opening-balances', filters: { canReconcile } }), queryFn: fetchOpening, policy: policies.paginated });
  const data = circuit.data;
  const wb = workbench.data;
  const can = (p: string) => permissions.includes(p);
  const mutate = async (path: `/${string}`, body: unknown, method: 'POST'|'PATCH' = 'POST'):Promise<boolean> => {
    if (busy) return false;
    setBusy(true); setMessage('');
    const fingerprint = JSON.stringify({ clubId, path, body });
    const operationKey = operationKeys.current.get(fingerprint) ?? crypto.randomUUID();
    operationKeys.current.set(fingerprint, operationKey);
    try {
      await apiJson(path, { method, headers: { 'idempotency-key': operationKey }, body: JSON.stringify(body) });
      operationKeys.current.delete(fingerprint);
      invalidateTenantQueries(clubId); await Promise.all([circuit.refetch(), workbench.refetch(), opening.refetch()]); setMessage('Operación registrada. Saldos actualizados.');return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar la operación.');return false; }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>, action: (form: FormData) => Promise<unknown>) => { event.preventDefault(); void action(new FormData(event.currentTarget)); };
  if (!can(PERMISSIONS.FINANCE_READ)) return null;
  if (circuit.error) return <section className="finance-circuit" role="alert"><p>No se pudo consultar el circuito financiero.</p><p>{circuit.error instanceof Error ? circuit.error.message : 'Compruebe la conexión e intente nuevamente.'}</p><button onClick={() => void circuit.refetch().catch(() => undefined)}>Reintentar</button></section>;
  if (!data) return <p role="status">Consultando saldos financieros…</p>;
  const p = data.projection;
  const selectedSettlement = data.settlements.find(row => row.id === selectedSettlementId);
  const selectedCompensation = data.compensationObligations?.find(row => row.id === selectedCompensationId);
  const filteredSettlements = data.settlements.filter(row => `${row.activityName} ${row.personName} ${row.month}`.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')) &&
    (reviewFilter === 'ALL' || row.reviewState === reviewFilter));
  return <section className="section-panel finance-circuit" aria-label="Circuito financiero">
    <header className="section-header finance-circuit__header"><div><p className="eyebrow">Administración financiera</p><h3>{summaryOnly ? 'Saldos financieros' : 'Liquidaciones y conciliación'}</h3><p>Derechos, pagos, remuneraciones y conciliación con historia verificable.</p></div>{!summaryOnly&&<button type="button" className="ghost-btn" onClick={()=>void circuit.refetch()}>Actualizar</button>}
      {!summaryOnly&&<nav className="finance-tabs" role="tablist" aria-label="Secciones de liquidaciones">{financeTabs.map(([key,label],index)=><button key={key} ref={element=>{tabsRef.current[index]=element;}} id={`finance-tab-${key}`} type="button" role="tab" aria-selected={tab===key} aria-controls={`finance-panel-${key}`} tabIndex={tab===key?0:-1} onKeyDown={event=>onTabKeyDown(event,index)} onClick={()=>setTab(key)}>{label}</button>)}</nav>}
    </header>
    {!summaryOnly&&financeTabs.filter(([key])=>key!==tab).map(([key])=><div key={key} id={`finance-panel-${key}`} role="tabpanel" aria-labelledby={`finance-tab-${key}`} hidden/>)}
    {!summaryOnly && Boolean(workbench.error) && <p role="alert">No se pudieron cargar las herramientas financieras: {workbench.error instanceof Error ? workbench.error.message : 'Error desconocido.'} <button type="button" onClick={() => void workbench.refetch()}>Reintentar</button></p>}
    {!summaryOnly && !wb && !workbench.error && <p role="status">Cargando herramientas financieras…</p>}
    {canReconcile && Boolean(opening.error) && <p role="alert">No se pudieron cargar los saldos de apertura: {opening.error instanceof Error ? opening.error.message : 'Error desconocido.'} <button type="button" onClick={() => void opening.refetch()}>Reintentar</button></p>}
    {(summaryOnly || tab==='overview') && <div id={summaryOnly?undefined:'finance-panel-overview'} role={summaryOnly?undefined:'tabpanel'} aria-labelledby={summaryOnly?undefined:'finance-tab-overview'}><div className="finance-totals economy-kpi-strip">
      {([['Liquidez','💧','Disponible en cuentas',p.liquidity,'Saldo registrado','utility'],['Saldo proyectado','📈','Tras obligaciones pendientes',p.projectedBalance,'Según componentes y supuestos','projected'],['Estimación futura','🔭','Proyección del circuito',p.futureEstimate,'Según componentes y supuestos','positive']] as const).map(([label,icon,subtitle,value,detail,variant])=><article className={`card home-kpi-card home-kpi-card--compact finance-card economy-top-card economy-top-card--${variant} finance-projection-card`} key={label}><div className="home-card-heading finance-card__header economy-top-card__header"><div className="economy-top-card__title-row"><h4><span className="economy-top-card__icon" aria-hidden="true">{icon}</span><span>{label}</span></h4></div><p className="economy-top-card__subtitle">{subtitle}</p></div><div className="economy-top-card__value-row"><p className="economy-top-card__value">{money(value,p.currencyCode)}</p></div><p className="economy-top-card__detail">{value===null?'Sin valoración completa · ver componentes':detail}</p></article>)}
    </div>
    <div className="finance-currency-totals" aria-label="Saldos operativos separados">
      {data.balanceTotals.map(total => <section className="finance-balance-card" key={total.currencyCode} aria-label={`Saldos en ${total.currencyCode}`}><h4 className="finance-balance-card__currency">{total.currencyCode}</h4><div className="finance-balance-card__metrics"><div><span>A liquidar aprobado</span><strong>{money(total.approvedToPay,total.currencyCode)}</strong></div><div><span>Devengado pendiente de revisión</span><strong>{money(total.pendingReviewToPay,total.currencyCode)}</strong></div><div><span>A cobrar</span><strong>{money(total.activityToCollect,total.currencyCode)}</strong></div></div></section>)}
      {!data.balanceTotals.length && <p>Sin saldos a liquidar ni a cobrar.</p>}
    </div>
    {!p.complete && <p className="finance-incomplete" role="status">Proyección incompleta: revise acuerdos, cuentas y cotizaciones pendientes.</p>}
    <details className="finance-components"><summary>Componentes y supuestos</summary>
      <div className="finance-components__grid">{([['Cobros pendientes',p.pendingCollections],['Pagos pendientes',p.pendingPayments],['Liquidaciones pendientes',p.pendingSettlements],['Liquidaciones previstas',p.expectedSettlements],['Participación adicional en cuotas',p.additionalClubReceivables]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value,p.currencyCode)}</strong></div>)}</div>
      <p><strong>Calculado:</strong> {new Date(p.calculatedAt).toLocaleString('es-AR')}</p>{p.assumptions.length>0&&<div className={!p.complete?'finance-components__issues':undefined}><strong>{p.complete?'Supuestos del cálculo':'Causas y supuestos a revisar'}</strong><ul>{p.assumptions.map(a => <li key={a}>{a}</li>)}</ul></div>}
    </details>{!summaryOnly&&tab==='overview'&&<div className="finance-overview-actions"><p>Proyecciones al día de hoy. Las liquidaciones pueden mostrar períodos anteriores.</p><button type="button" onClick={()=>setTab('settlements')}>Revisar liquidaciones</button><button type="button" onClick={()=>setTab('reconciliation')}>Abrir conciliación</button></div>}</div>}
    {summaryOnly ? null : <>
      {message&&<p className="finance-feedback" role="status" aria-live="polite">{message}</p>}
      {tab==='settlements'&&<div id="finance-panel-settlements" role="tabpanel" aria-labelledby="finance-tab-settlements">
      <div className="finance-toolbar"><label>Período hasta <input type="month" value={month || data.month} max={data.today.slice(0, 7)} onChange={e => setMonth(e.target.value)} /></label><label>Buscar<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Actividad o responsable" /></label><label>Revisión<select value={reviewFilter} onChange={e=>setReviewFilter(e.target.value)}><option value="ALL">Todas</option><option value="DRAFT">Borrador</option><option value="REQUIRES_REVIEW">Requiere revisión</option><option value="APPROVED">Aprobada</option></select></label></div>
      <p>Se incluyen deudas anteriores. Aprobar, pagar y cerrar son operaciones independientes.</p>
      {data.diagnostics.length > 0 && <details open><summary>Acuerdos que requieren revisión ({data.diagnostics.length})</summary>{data.diagnostics.map((d, i) => <p key={`${d.activityId}-${i}`}>{d.message}</p>)}</details>}
      <div className="finance-table"><table><thead><tr><th>Período y actividad</th><th>Responsable</th><th>Saldo</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>
        {filteredSettlements.map(s => <tr key={s.id}><td><strong>{s.activityName}</strong><small>{s.month}</small></td><td>{s.personName}</td><td className="finance-amount" data-negative={s.balance<0}>{money(s.balance,s.currencyCode)}</td><td><span className="finance-status" data-status={s.reviewState}>{({DRAFT:'Borrador',APPROVED:'Aprobada',REQUIRES_REVIEW:'Requiere revisión'})[s.reviewState]}{s.closedAt?' · Cerrada':''}</span></td><td><button type="button" onClick={()=>setSelectedSettlementId(s.id)}>Ver detalle</button></td></tr>)}
      </tbody></table>{filteredSettlements.length===0&&<p className="finance-empty">No hay liquidaciones para estos filtros.</p>}</div>
      {selectedSettlement&&<SettlementDetail settlement={selectedSettlement} today={data.today} canReview={can(PERMISSIONS.FINANCE_REVIEW)} canCorrect={can(PERMISSIONS.FINANCE_CORRECT)} canViewHistory={can(PERMISSIONS.SECTORS_ANY)} busy={busy} mutate={mutate} onClose={()=>setSelectedSettlementId(null)}/>}
      {wb && can(PERMISSIONS.FINANCE_PAY) && can(PERMISSIONS.SECTORS_ANY) && <><button type="button" onClick={()=>setProcessingOpen(true)}>Procesar liquidación o remuneración</button>{processingOpen&&<ProcessingModal data={data} workbench={wb} busy={busy} mutate={mutate} onClose={()=>setProcessingOpen(false)}/>}</>}
      {(data.payoutGroups?.length??0)>0 && <details><summary>Grupos procesados ({data.payoutGroups?.length})</summary><div className="finance-table"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Operación</th><th>Importe</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{data.payoutGroups?.map(g=><tr key={g.id}><td>{new Date(g.createdAt).toLocaleString('es-AR')}</td><td>{g.personName}</td><td>{g.direction==='PAY'?'Pago':'Cobro'}</td><td>{money(g.amount,g.currencyCode)}</td><td>{g.status}</td><td><button type="button" onClick={()=>setSelectedGroupId(g.id)}>Ver detalle</button></td></tr>)}</tbody></table></div></details>}
      {data.payoutGroups?.find(g=>g.id===selectedGroupId)&&<PayoutGroupDetail group={data.payoutGroups.find(g=>g.id===selectedGroupId)!} canCorrect={can(PERMISSIONS.FINANCE_CORRECT)} busy={busy} mutate={mutate} onClose={()=>setSelectedGroupId(null)}/>}
      {can(PERMISSIONS.FINANCE_CORRECT) && <details><summary>Responsables históricos</summary>{data.terms.map(t => <form key={`${t.id}-${t.revision}`} className="finance-form" onSubmit={e => submit(e, f => mutate(`/api/finance/terms/${t.id}/resolve`, { revision: t.revision, personId: f.get('personId'), reason: f.get('reason') }))}>
        <p>{t.activityName} · {t.effectiveFrom} — {t.effectiveTo || 'vigente'}</p>{select('personId', 'Responsable confirmado', data.people, true, t.personId || '')}
        {t.mode === 'FIXED' && <p>Los vencimientos se imputan completos al mes correspondiente, sin prorrateo.</p>}
        <label>Motivo<input name="reason" required /></label><button disabled={busy}>Guardar definición</button>
      </form>)}</details>}
      </div>}
      {tab==='compensation'&&<div id="finance-panel-compensation" role="tabpanel" aria-labelledby="finance-tab-compensation">
        <div className="finance-section-heading"><div><h4>Remuneraciones fijas</h4><p>Las obligaciones aprobadas se procesan con el saldo neto de la persona.</p></div></div>
        {can(PERMISSIONS.FINANCE_REVIEW) && <form className="finance-form" onSubmit={e=>submit(e,f=>mutate('/api/finance/compensation-obligations/refresh',{through:f.get('through'),reason:f.get('reason')}))}><label>Generar hasta<input name="through" type="date" defaultValue={data.today} max={data.today}/></label><label>Motivo<input name="reason" required/></label><button disabled={busy}>Actualizar borradores</button></form>}
        <div className="finance-table"><table><thead><tr><th>Persona</th><th>Vencimiento</th><th>Importe</th><th>Saldo</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{(data.compensationObligations ?? []).map(o=><tr key={o.id}><td>{o.personName}</td><td>{o.dueDate}</td><td>{money(o.amount,o.currencyCode)}</td><td className="finance-amount">{money(o.balance,o.currencyCode)}</td><td><span className="finance-status" data-status={o.reviewState}>{o.reviewState==='REQUIRES_REVIEW'?'Requiere revisión':o.reviewState==='APPROVED'?'Aprobada':o.reviewState==='CANCELLED'?'Cancelada':'Borrador'}</span></td><td><button type="button" onClick={()=>setSelectedCompensationId(o.id)}>Ver detalle</button></td></tr>)}</tbody></table>{!(data.compensationObligations??[]).length&&<p className="finance-empty">No hay remuneraciones generadas para este período.</p>}</div>
        {selectedCompensation&&<CompensationDetail obligation={selectedCompensation} sectors={wb?.sectors??[]} canReview={can(PERMISSIONS.FINANCE_REVIEW)} canCorrect={can(PERMISSIONS.FINANCE_CORRECT)} canViewHistory={can(PERMISSIONS.SECTORS_ANY)} busy={busy} mutate={mutate} onClose={()=>setSelectedCompensationId(null)}/>}
      </div>}
      {tab==='reconciliation' && <div id="finance-panel-reconciliation" role="tabpanel" aria-labelledby="finance-tab-reconciliation"><div className="finance-overview-actions">{can(PERMISSIONS.FINANCE_READ)&&<button type="button" onClick={()=>openAdministrationArea('movement-list')}>Abrir Movimientos para altas, correcciones y devoluciones</button>}{can(PERMISSIONS.ENROLLMENTS_VIEW)&&<button type="button" onClick={()=>openAdministrationArea('enrollment-list')}>Abrir Inscripciones para cuotas y bajas</button>}</div>{canReconcile&&<ReconciliationQueue clubId={clubId} mutate={mutate} busy={busy}/>}
      {wb && <>
        {can(PERMISSIONS.FINANCE_PAY) && can(PERMISSIONS.SECTORS_ANY) && <details><summary>Pagar saldos iniciales de empleados y proveedores</summary><form className="finance-form" onSubmit={e => submit(e,f => mutate(`/api/finance/initial-obligations/${formText(f,'obligationId')}/pay`,{ accountId:f.get('accountId'),categoryId:f.get('categoryId'),amount:Number(f.get('amount')),date:f.get('date'),reason:f.get('reason') }))}>
          {select('obligationId','Obligación aprobada',wb.initialObligations.filter(o => o.id && o.reviewState==='APPROVED' && ['EMPLOYEE','SUPPLIER'].includes(o.kind) && (o.balance??0)>0).map(o => ({id:o.id!,name:`${data.people.find(p=>p.id===o.personId)?.name ?? o.sourceKey} · ${money(o.balance??0,o.currencyCode)}`})))}
          {select('accountId','Cuenta financiera',data.accounts)}{select('categoryId','Categoría operativa o Deudas',wb.categories.filter(c=>c.classification==='OPERATIONAL'||c.code==='DEUDAS'))}<label>Importe<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Fecha<input name="date" type="date" defaultValue={data.today} max={data.today} required /></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>Registrar pago</button>
        </form></details>}
        {canReconcile && <OpeningBalancesCard data={opening.data} busy={busy} mutate={mutate}/>}
        {canReconcile && <StartupForm data={data} workbench={wb} busy={busy} mutate={mutate} />}
      </>}
    </div>}
    </>}
  </section>;
}

type Mutate = (path: `/${string}`, body: unknown, method?: 'POST'|'PATCH') => Promise<boolean>;
type HistoryEntry = { reason: string; created_at: string; actor_id: string; before_data: unknown; after_data: unknown };

function SettlementDetail({ settlement: s, canReview, canCorrect, canViewHistory, busy, mutate, onClose }: {
  settlement: PersistedSettlement; today: string; canReview: boolean; canCorrect: boolean; canViewHistory: boolean; busy: boolean; mutate: Mutate; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [adjustments,setAdjustments]=useState<{id:string;amount:number;reason:string;status:string;revision:number;createdAt:string}[]>([]);
  useModalAccessibility(dialog, true, onClose);
  useEffect(() => {
    if (!canViewHistory) return;
    const controller = new AbortController();
    void apiJson<HistoryEntry[]>(`/api/finance/history/activity_settlements/${s.id}`, {signal:controller.signal}).then(setHistory).catch(error => {if(!controller.signal.aborted)setHistoryError(error instanceof Error?error.message:'No se pudo consultar el historial.');});
    return () => controller.abort();
  }, [s.id, canViewHistory]);
  useEffect(()=>{const controller=new AbortController();void apiJson<typeof adjustments>(`/api/finance/settlements/${s.id}/adjustments`,{signal:controller.signal}).then(setAdjustments).catch(()=>undefined);return()=>controller.abort();},[s.id]);
  const submit = (event: FormEvent<HTMLFormElement>, path: `/${string}`, extra: Record<string,unknown> = {}) => {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    void mutate(path,{revision:s.revision,...extra,reason:formText(f,'reason')}).then(ok=>{if(ok)onClose();});
  };
  return <div className="sector-modal__backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={dialog} className="sector-modal finance-detail" role="dialog" aria-modal="true" aria-labelledby="settlement-detail-title" tabIndex={-1}>
    <header className="sector-modal__header"><div><p className="eyebrow">Liquidación · {s.month}</p><h2 id="settlement-detail-title">{s.activityName}</h2><p>{s.personName} · {s.currencyCode} · revisión {s.revision}</p></div><button type="button" className="sector-modal__close" onClick={onClose} aria-label="Cerrar detalle">×</button></header>
    <div className="finance-detail__body"><p className="finance-status" data-status={s.reviewState}>{s.reviewState==='APPROVED'?'Aprobada':s.reviewState==='DRAFT'?'Borrador':'Requiere revisión'}{s.closedAt?' · Cerrada':''}</p>
      <dl><dt>Ingresos completados</dt><dd>{money(s.income,s.currencyCode)}</dd><dt>Devoluciones</dt><dd>{money(s.refunds,s.currencyCode)}</dd><dt>Parte del responsable</dt><dd>{money(s.responsibleIncome-s.responsibleRefunds,s.currencyCode)}</dd><dt>Canon fijo del club</dt><dd>{money(s.fixedClubFee,s.currencyCode)}</dd><dt>Pagos aplicados</dt><dd>{money(s.payments,s.currencyCode)}</dd><dt>Cobros de deuda</dt><dd>{money(s.debtCollections,s.currencyCode)}</dd><dt>Ajustes</dt><dd>{money(s.adjustments??0,s.currencyCode)}</dd><dt>Saldo</dt><dd><strong>{money(s.balance,s.currencyCode)}</strong></dd></dl>
      {s.initialObligationId&&<p>El saldo inicial se aprueba en la conciliación del arranque.</p>}
      {canReview&&!s.initialObligationId&&s.reviewState!=='APPROVED'&&<form className="finance-form" onSubmit={e=>submit(e,`/api/finance/settlements/${s.id}/approve`)}><label>Motivo de aprobación<input name="reason" required/></label><button disabled={busy}>Aprobar versión</button></form>}
      {canReview&&!s.initialObligationId&&s.reviewState==='APPROVED'&&!s.closedAt&&<form className="finance-form" onSubmit={e=>submit(e,`/api/finance/settlements/${s.id}/close`)}><label>Motivo de cierre<input name="reason" required/></label><button disabled={busy}>Cerrar liquidación</button></form>}
      {canCorrect&&!s.initialObligationId&&<form className="finance-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(`/api/finance/settlements/${s.id}/adjustments`,{revision:s.revision,amount:Number(f.get('amount')),reason:formText(f,'reason')}).then(ok=>{if(ok)onClose();});}}><label>Ajuste positivo o negativo<input name="amount" type="number" step="0.01" required/></label><label>Motivo del ajuste<input name="reason" required/></label><button disabled={busy}>Registrar ajuste</button></form>}
      {adjustments.length>0&&<details><summary>Ajustes ({adjustments.length})</summary>{adjustments.map(a=><div className="finance-adjustment" key={a.id}><p>{money(a.amount,s.currencyCode)} · {a.status} · {a.reason} · {new Date(a.createdAt).toLocaleString('es-AR')}</p>{canCorrect&&a.status==='ACTIVE'&&<form className="finance-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(`/api/finance/settlement-adjustments/${a.id}/void`,{revision:a.revision,reason:formText(f,'reason')}).then(ok=>{if(ok)onClose();});}}><label>Motivo de anulación<input name="reason" required/></label><button disabled={busy}>Anular ajuste</button></form>}</div>)}</details>}
      {canViewHistory&&<details><summary>Historial de revisión ({history.length})</summary>{historyError&&<p role="alert">{historyError}</p>}{history.map((entry,i)=><p key={i}>{new Date(entry.created_at).toLocaleString('es-AR')} · {entry.reason}</p>)}</details>}
    </div>
  </div></div>;
}

function CompensationDetail({obligation:o,sectors,canReview,canCorrect,canViewHistory,busy,mutate,onClose}:{
  obligation:EmployeeCompensationObligation;sectors:Option[];canReview:boolean;canCorrect:boolean;canViewHistory:boolean;busy:boolean;mutate:Mutate;onClose:()=>void;
}) {
  const dialog=useRef<HTMLDivElement>(null);useModalAccessibility(dialog,true,onClose);
  const [history,setHistory]=useState<HistoryEntry[]>([]);
  useEffect(()=>{if(!canViewHistory)return;const controller=new AbortController();void apiJson<HistoryEntry[]>(`/api/finance/history/employee_compensation_obligations/${o.id}`,{signal:controller.signal}).then(setHistory).catch(()=>undefined);return()=>controller.abort();},[canViewHistory,o.id]);
  const action=(event:FormEvent<HTMLFormElement>,operation:'approve'|'cancel')=>{event.preventDefault();const f=new FormData(event.currentTarget);void mutate(`/api/finance/compensation-obligations/${o.id}/${operation}`,{revision:o.revision,reason:formText(f,'reason')}).then(ok=>{if(ok)onClose();});};
  return <div className="sector-modal__backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={dialog} className="sector-modal finance-detail" role="dialog" aria-modal="true" aria-labelledby="compensation-detail-title" tabIndex={-1}><header className="sector-modal__header"><div><p className="eyebrow">Remuneración fija</p><h2 id="compensation-detail-title">{o.personName}</h2><p>Período {o.periodFrom} a {o.periodTo} · revisión {o.revision}</p></div><button type="button" className="sector-modal__close" onClick={onClose} aria-label="Cerrar detalle">×</button></header><div className="finance-detail__body"><dl><dt>Vencimiento</dt><dd>{o.dueDate}</dd><dt>Importe</dt><dd>{money(o.amount,o.currencyCode)}</dd><dt>Pagado</dt><dd>{money(o.paid,o.currencyCode)}</dd><dt>Saldo</dt><dd>{money(o.balance,o.currencyCode)}</dd><dt>Estado</dt><dd>{o.reviewState}</dd></dl>
    {canCorrect&&o.reviewState!=='CANCELLED'&&<form className="finance-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(`/api/finance/compensation-obligations/${o.id}`,{revision:o.revision,amount:Number(f.get('amount')),periodFrom:f.get('periodFrom'),periodTo:f.get('periodTo'),dueDate:f.get('dueDate'),sectorId:f.get('sectorId')||null,reason:f.get('reason')},'PATCH').then(ok=>{if(ok)onClose();});}}><label>Importe<input name="amount" type="number" min="0" step="0.01" defaultValue={o.amount} required/></label><label>Desde<input name="periodFrom" type="date" defaultValue={o.periodFrom} required/></label><label>Hasta<input name="periodTo" type="date" defaultValue={o.periodTo} required/></label><label>Vencimiento<input name="dueDate" type="date" defaultValue={o.dueDate} required/></label>{select('sectorId','Sector',sectors,false,o.sectorId??'')}<label>Motivo<input name="reason" required/></label><button disabled={busy}>Guardar corrección</button></form>}
    {canReview&&o.reviewState!=='APPROVED'&&o.reviewState!=='CANCELLED'&&<form className="finance-form" onSubmit={e=>action(e,'approve')}><label>Motivo<input name="reason" required/></label><button disabled={busy}>Aprobar</button></form>}
    {canReview&&o.reviewState!=='CANCELLED'&&<form className="finance-form" onSubmit={e=>action(e,'cancel')}><label>Motivo de anulación<input name="reason" required/></label><button disabled={busy}>Cancelar obligación</button></form>}
    {canViewHistory&&<details><summary>Historial ({history.length})</summary>{history.map((entry,i)=><p key={i}>{new Date(entry.created_at).toLocaleString('es-AR')} · {entry.reason}</p>)}</details>}
  </div></div></div>;
}

type PaymentPreview={net:number;available:number;currencyCode:string;previewHash:string;compensations:{debtId:string;debtLabel:string;creditId:string;creditLabel:string;amount:number}[];portions:{kind:string;id:string;label:string;amount:number}[]};
function PayoutGroupDetail({group,canCorrect,busy,mutate,onClose}:{group:NonNullable<FinancialCircuit['payoutGroups']>[number];canCorrect:boolean;busy:boolean;mutate:Mutate;onClose:()=>void}){
  const dialog=useRef<HTMLDivElement>(null);useModalAccessibility(dialog,true,onClose);
  return <div className="sector-modal__backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={dialog} className="sector-modal finance-detail" role="dialog" aria-modal="true" aria-labelledby="payout-detail-title" tabIndex={-1}><header className="sector-modal__header"><div><p className="eyebrow">{group.direction==='PAY'?'Pago procesado':'Cobro procesado'}</p><h2 id="payout-detail-title">{group.personName}</h2><p>{new Date(group.createdAt).toLocaleString('es-AR')} · {group.status}</p></div><button type="button" className="sector-modal__close" onClick={onClose} aria-label="Cerrar detalle">×</button></header><div className="finance-detail__body"><dl><dt>Importe</dt><dd>{money(group.amount,group.currencyCode)}</dd><dt>Motivo</dt><dd>{group.reason}</dd><dt>Identificador</dt><dd><code>{group.id}</code></dd>{group.voidedAt&&<><dt>Anulado</dt><dd>{new Date(group.voidedAt).toLocaleString('es-AR')}</dd></>}</dl>{canCorrect&&group.status==='COMPLETED'&&<form className="finance-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(`/api/finance/payout-groups/${group.id}/void`,{reason:formText(f,'reason')}).then(ok=>{if(ok)onClose();});}}><p>La anulación revierte movimientos y aplicaciones del grupo.</p><label>Motivo de anulación<input name="reason" required/></label><button disabled={busy}>Anular grupo</button></form>}</div></div></div>;
}
function ProcessingModal({data,workbench,busy,mutate,onClose}:{data:FinancialCircuit;workbench:Workbench;busy:boolean;mutate:Mutate;onClose:()=>void}){
  const dialog=useRef<HTMLDivElement>(null);const form=useRef<HTMLFormElement>(null);
  const [kind,setKind]=useState<'pay'|'debt'>('pay');const [preview,setPreview]=useState<PaymentPreview|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
  useModalAccessibility(dialog,true,onClose);
  const body=()=>{const f=new FormData(form.current!);return {personId:formText(f,'personId'),accountId:formText(f,'accountId'),categoryId:formText(f,'categoryId'),paymentMethodId:formText(f,'paymentMethodId'),amount:Number(f.get('amount')),date:formText(f,'date'),debtCollection:kind==='debt',reason:formText(f,'reason')};};
  const prepare=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const b=body();setError('');setLoading(true);try{setPreview(await apiJson<PaymentPreview>(`/api/finance/responsibles/${b.personId}/preview`,{method:'POST',body:JSON.stringify({accountId:b.accountId,amount:b.amount,debtCollection:b.debtCollection})}));}catch(cause){setPreview(null);setError(cause instanceof Error?cause.message:'No se pudo preparar el desglose.');}finally{setLoading(false);}};
  const confirm=()=>{if(!preview)return;const b=body();void mutate(`/api/finance/responsibles/${b.personId}/pay`,{...b,previewHash:preview.previewHash}).then(ok=>{if(ok)onClose();else setPreview(null);});};
  return <div className="sector-modal__backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={dialog} className="sector-modal finance-detail" role="dialog" aria-modal="true" aria-labelledby="process-balance-title" tabIndex={-1}><header className="sector-modal__header"><div><p className="eyebrow">Procesamiento financiero</p><h2 id="process-balance-title">Procesar saldo neto</h2><p>Revise las compensaciones y aplicaciones antes de confirmar.</p></div><button type="button" className="sector-modal__close" onClick={onClose} aria-label="Cerrar procesamiento">×</button></header><div className="finance-detail__body"><form ref={form} className="finance-form" onChange={()=>setPreview(null)} onSubmit={e=>void prepare(e)}>
    {select('personId','Persona',data.people)}{select('accountId','Cuenta',data.accounts.map(a=>({id:a.id,name:`${a.name} (${a.currencyCode})`})))}<label>Operación<select value={kind} onChange={e=>setKind(e.target.value==='debt'?'debt':'pay')}><option value="pay">Pagar saldo</option><option value="debt">Cobrar deuda</option></select></label>
    {select('categoryId','Categoría operativa o Deudas',workbench.categories.filter(c=>c.classification==='OPERATIONAL'||c.code==='DEUDAS'))}{select('paymentMethodId','Medio de pago',workbench.methods)}
    <label>Importe<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Fecha<input name="date" type="date" defaultValue={data.today} max={data.today} required/></label><label>Motivo<input name="reason" required/></label><button disabled={loading||busy}>{loading?'Calculando…':'Revisar desglose'}</button></form>
    {error&&<p role="alert">{error}</p>}{preview&&<section className="finance-preview"><h3>Vista previa · {preview.currencyCode}</h3><p>Saldo neto: <strong>{money(preview.net,preview.currencyCode)}</strong> · Disponible: <strong>{money(preview.available,preview.currencyCode)}</strong></p><h4>Compensaciones</h4>{preview.compensations.length?<ul>{preview.compensations.map((c,i)=><li key={i}>{c.debtLabel} ↔ {c.creditLabel}: {money(c.amount,preview.currencyCode)}</li>)}</ul>:<p>Sin compensaciones.</p>}<h4>Aplicaciones en orden de vencimiento</h4><ol>{preview.portions.map((p,i)=><li key={i}>{p.label} · {money(p.amount,preview.currencyCode)}</li>)}</ol><button type="button" disabled={busy} onClick={confirm}>Confirmar procesamiento</button></section>}
  </div></div></div>;
}

type QueueItem={id:string;revision:number;movementDate:string;movementType:string;concept:string;amount:number;currencyCode:string;accountName:string;reconciledAt:string|null};
function ReconciliationQueue({clubId,mutate,busy}:{clubId:string|null;mutate:Mutate;busy:boolean}){
  const [page,setPage]=useState(1);const [status,setStatus]=useState<'pending'|'all'>('pending');
  const [response,setResponse]=useState<{items:QueueItem[];total:number;pageSize:number}|null>(null);const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();void apiJson<{items:QueueItem[];total:number;pageSize:number}>(`/api/finance/reconciliation/movements?page=${page}&status=${status}`,{signal:controller.signal}).then(setResponse).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'No se pudo cargar la bandeja.');});return ()=>controller.abort();},[clubId,page,status,refresh]);
  return <section className="finance-queue"><div className="finance-section-heading"><div><h4>Movimientos para conciliar</h4><p>Movimientos completados con cuenta financiera; 20 registros por página.</p></div><label>Estado<select value={status} onChange={e=>{setStatus(e.target.value==='all'?'all':'pending');setPage(1);}}><option value="pending">Pendientes</option><option value="all">Todos</option></select></label></div>{error&&<p role="alert">{error} <button onClick={()=>{setError('');setRefresh(n=>n+1);}}>Reintentar</button></p>}
    <div className="finance-table"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Cuenta</th><th>Importe</th><th>Estado / acción</th></tr></thead><tbody>{response?.items.map(row=><tr key={row.id}><td>{row.movementDate}</td><td>{row.concept}</td><td>{row.accountName}</td><td>{money(row.amount,row.currencyCode)}</td><td>{row.reconciledAt?'Conciliado':<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(`/api/finance/movements/${row.id}/reconcile`,{revision:row.revision,reason:formText(f,'reason')}).then(ok=>{if(ok)setRefresh(n=>n+1);});}}><input name="reason" placeholder="Evidencia / motivo" required/><button disabled={busy}>Conciliar</button></form>}</td></tr>)}</tbody></table>{response?.items.length===0&&<p className="finance-empty">No hay movimientos en esta bandeja.</p>}{!response&&!error&&<p role="status">Cargando movimientos…</p>}</div>
    <div className="finance-pagination"><span>{response?.total??0} movimientos</span><button type="button" disabled={page===1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!response||page*response.pageSize>=response.total} onClick={()=>setPage(n=>n+1)}>Siguiente</button></div>
  </section>;
}

function OpeningBalancesCard({data,busy,mutate}:{data:OpeningBalances|null|undefined;busy:boolean;mutate:(path:`/${string}`,body:unknown,method?:'POST'|'PATCH')=>Promise<boolean>}){
  const value=(code:string)=>data?.movements.find(m=>m.accountCode===code&&!m.reversesMovementId)?.amount??0;
  return <details><summary>Saldos iniciales y correcciones</summary><p>Reemplazar crea una nueva revisión y revierte el lote anterior. Nunca duplica capital y requiere un motivo auditable.</p>{data?.batch&&<p>Lote vigente: revisión {data.batch.revision} · {data.batch.status} · {new Date(data.batch.createdAt).toLocaleString('es-AR')}</p>}<form className="finance-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('/api/finance/opening-balances/replace',{cash:Number(f.get('cash')),bank:Number(f.get('bank')),usdCash:Number(f.get('usdCash')),reason:f.get('reason')});}}><label>Caja<input name="cash" type="number" min="0" step="0.01" defaultValue={value('CASH')} required/></label><label>Banco<input name="bank" type="number" min="0" step="0.01" defaultValue={value('BANK')} required/></label><label>Caja USD<input name="usdCash" type="number" min="0" step="0.01" defaultValue={value('USD_CASH')} required/></label><label>Motivo de reemplazo<input name="reason" required/></label><label><input type="checkbox" required/>Confirmo que se reemplazará el lote de apertura vigente.</label><button disabled={busy}>Reemplazar saldos iniciales</button></form>{data&&data.revisions.length>0&&<details><summary>Historial de reemplazos ({data.revisions.length})</summary>{data.revisions.map(r=><p key={r.id}>{new Date(r.createdAt).toLocaleString('es-AR')} · {r.reason}</p>)}</details>}</details>;
}

function StartupForm({ data, workbench, busy, mutate }: { data: FinancialCircuit; workbench: Workbench; busy: boolean; mutate: (path: `/${string}`, body: unknown, method?: 'POST'|'PATCH') => Promise<boolean> }) {
  const [obligations, setObligations] = useState<OpeningObligation[]>(() => workbench.initialObligations.length ? workbench.initialObligations : workbench.startup?.preview.obligations ?? []);
  const [dirty,setDirty]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  return <details><summary>Arranque e importación conciliada</summary><p>Reconstrucción: saldo anterior y movimientos completos posteriores. Fecha de corte: saldos al cierre y sólo operaciones posteriores. La historia anterior permanece consultable.</p>
    {dirty&&<p role="status">Hay cambios locales sin comparar. Se conservan mientras se actualizan los datos. <button type="button" onClick={()=>{setDirty(false);setObligations(workbench.initialObligations.length ? workbench.initialObligations : workbench.startup?.preview.obligations ?? []);formRef.current?.reset();}}>Descartar cambios locales</button></p>}
    <form ref={formRef} className="finance-form" onChange={()=>setDirty(true)} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void mutate('/api/finance/startup/preview', { mode: f.get('mode'), cutoffDate: f.get('cutoffDate'), accounts: data.accounts.map(a => ({ accountId: a.id, amount: Number(f.get(a.id)) })), obligations: obligations.map(o => ({ ...o, activityId: o.activityId || null })), reason: f.get('reason') }); }}>
      <label>Modalidad<select name="mode" defaultValue={workbench.startup?.mode || 'RECONSTRUCTION'}><option value="RECONSTRUCTION">Reconstrucción</option><option value="CUTOFF">Fecha de corte</option></select></label><label>Saldo al cierre de<input name="cutoffDate" type="date" defaultValue={workbench.startup?.cutoffDate || data.today} required /></label>
      {data.accounts.map(a => <label key={a.id}>Saldo esperado: {a.name} ({a.currencyCode})<input name={a.id} type="number" step="0.01" defaultValue={workbench.startup?.preview.accounts?.find(row => row.accountId === a.id)?.amount ?? 0} required /></label>)}
      <fieldset><legend>Obligaciones iniciales sin movimiento de caja</legend><p>Responsable: positivo si el club debe pagarle; negativo si debe al club. Alumnos: deuda positiva del alumno.</p>
        {obligations.map((o, i) => <div className="finance-form" key={i} onChange={()=>setDirty(true)}>
          <label>Identificador de origen<input value={o.sourceKey} required onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, sourceKey: e.target.value } : r))} /></label>
          <label>Persona<select required value={o.personId} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, personId: e.target.value } : r))}><option value="">Seleccionar…</option>{data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Tipo<select value={o.kind} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, kind: e.target.value } : r))}><option value="STUDENT">Alumno</option><option value="RESPONSIBLE">Responsable</option><option value="EMPLOYEE">Empleado</option><option value="SUPPLIER">Proveedor</option></select></label>
          <label>Actividad<select value={o.activityId} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, activityId: e.target.value } : r))}><option value="">General</option>{workbench.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Moneda<select value={o.currencyCode} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, currencyCode: e.target.value } : r))}>{['ARS', 'USD', 'BRL', 'EUR'].map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Saldo<input type="number" step="0.01" required value={o.amount} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, amount: Number(e.target.value) } : r))} /></label><label>Vencimiento<input type="date" required value={o.dueDate} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, dueDate: e.target.value } : r))} /></label><button type="button" onClick={() => {setDirty(true);setObligations(rows => rows.filter((_, n) => n !== i));}}>Quitar</button>
        </div>)}<button type="button" onClick={() => {setDirty(true);setObligations(rows => [...rows, { sourceKey: '', personId: '', activityId: '', kind: 'STUDENT', currencyCode: data.projection.currencyCode, amount: 0, dueDate: data.today }]);}}>Agregar obligación</button>
      </fieldset><label>Motivo<input name="reason" required /></label><button disabled={busy}>Preparar comparación</button>
    </form>
    {workbench.startup && <><p>Estado: {workbench.startup.status} · Versión {workbench.startup.revision}</p><div className="finance-table"><table><thead><tr><th>Cuenta</th><th>Esperado</th><th>Registrado</th><th>Diferencia</th></tr></thead><tbody>{workbench.startup.preview.differences?.map(d => {const currency=data.accounts.find(a=>a.id===d.accountId)?.currencyCode??'ARS';return <tr key={d.accountId}><td>{data.accounts.find(a => a.id === d.accountId)?.name}</td><td>{money(d.expected,currency)}</td><td>{money(d.imported,currency)}</td><td>{money(d.difference,currency)}</td></tr>;})}</tbody></table></div><form className="finance-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void mutate('/api/finance/startup/approve', { revision: workbench.startup!.revision, acceptDifferences: f.get('accept') === 'on', reason: f.get('reason') }); }}><label><input name="accept" type="checkbox" />Acepto explícitamente las diferencias indicadas</label><label>Motivo / evidencia<input name="reason" required /></label><button disabled={busy}>Aprobar saldos de arranque</button></form></>}
  </details>;
}
