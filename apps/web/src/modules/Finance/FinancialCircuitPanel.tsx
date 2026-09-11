import { useCallback, useRef, useState, type FormEvent } from 'react';
import { PERMISSIONS, type FinancialCircuit } from '@miclub/shared';
import { apiJson } from '../../api';
import { useSession } from '../../session';
import { useServerQuery } from '../../serverState/client';
import { queryKey } from '../../serverState/queryKeys';
import { policies } from '../../serverState/policies';
import { invalidateTenantQueries } from '../../serverState/invalidation';
import './financialCircuit.css';

type Option = { id: string; name: string };
type OpeningObligation = { id?: string; reviewState?: string; balance?: number; sourceKey: string; personId: string; activityId: string; kind: string; currencyCode: string; amount: number; dueDate: string };
const formText = (form: FormData, key: string): string => { const value = form.get(key); return typeof value === 'string' ? value : ''; };
type Cash = { movementDate: string; movementType: string; accountId: string | null; categoryId: string | null; sectorId: string; activityId: string | null; personId: string | null; paymentMethodId: string | null; concept: string; counterpartyText: string; amount: number; taxes: number; operationalStatus: string; receivableId: string | null };
type Workbench = { initialObligations: OpeningObligation[]; movements: (Cash & { id: string; revision: number; reconciledAt: string | null })[]; categories: (Option & { direction: string })[]; sectors: Option[]; methods: Option[]; activities: (Option & { sectorId: string })[]; enrollments: Option[]; receivables: { id: string; personId: string; activityId: string; concept: string; balance: number; currencyCode: string }[]; startup: { revision: number; status: string; mode: string; cutoffDate: string; preview: { accounts?: { accountId: string; amount: number }[]; obligations?: OpeningObligation[]; differences: { accountId: string; expected: number; imported: number; difference: number }[] } } | null };
const money = (value: number | null, currency: string) => value === null ? 'Pendiente de valoración' : new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(value);
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
  const [selected, setSelected] = useState<string>('');
  const operationKeys = useRef(new Map<string, string>());
  const fetchCircuit = useCallback(({ signal }: { signal: AbortSignal }) => apiJson<FinancialCircuit>(`/api/finance/circuit${month ? `?month=${month}` : ''}`, { signal }), [month]);
  const circuit = useServerQuery({ key: queryKey({ clubId, resource: 'financial-circuit', filters: { month } }), queryFn: fetchCircuit, policy: policies.dashboard });
  const fetchWorkbench = useCallback(({ signal }: { signal: AbortSignal }) => summaryOnly ? Promise.resolve(null) : apiJson<Workbench>('/api/finance/workbench', { signal }), [summaryOnly]);
  const workbench = useServerQuery({ key: queryKey({ clubId, resource: 'financial-workbench', filters: { summaryOnly } }), queryFn: fetchWorkbench, policy: policies.paginated });
  const data = circuit.data;
  const wb = workbench.data;
  const can = (p: string) => permissions.includes(p);
  const mutate = async (path: `/${string}`, body: unknown) => {
    if (busy) return;
    setBusy(true); setMessage('');
    const fingerprint = JSON.stringify({ clubId, path, body });
    const operationKey = operationKeys.current.get(fingerprint) ?? crypto.randomUUID();
    operationKeys.current.set(fingerprint, operationKey);
    try {
      await apiJson(path, { method: 'POST', headers: { 'idempotency-key': operationKey }, body: JSON.stringify(body) });
      operationKeys.current.delete(fingerprint);
      invalidateTenantQueries(clubId); await Promise.all([circuit.refetch(), workbench.refetch()]); setMessage('Operación registrada. Saldos actualizados.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo registrar la operación.'); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>, action: (form: FormData) => Promise<void>) => { event.preventDefault(); void action(new FormData(event.currentTarget)); };
  if (!can(PERMISSIONS.FINANCE_READ)) return null;
  if (circuit.error) return <section className="finance-circuit" role="alert"><p>No se pudo consultar el circuito financiero.</p><p>{circuit.error instanceof Error ? circuit.error.message : 'Compruebe la conexión e intente nuevamente.'}</p><button onClick={() => void circuit.refetch().catch(() => undefined)}>Reintentar</button></section>;
  if (!data) return <p role="status">Consultando saldos financieros…</p>;
  const p = data.projection;
  const edit = wb?.movements.find(m => m.id === selected);
  return <section className="finance-circuit" aria-label="Circuito financiero">
    <h2>{summaryOnly ? 'Saldos financieros' : 'Liquidaciones y conciliación'}</h2>
    <div className="finance-totals">
      <p>Liquidez <strong>{money(p.liquidity, p.currencyCode)}</strong></p>
      <p>Saldo proyectado <strong>{money(p.projectedBalance, p.currencyCode)}</strong></p>
      <p>Estimación futura <strong>{money(p.futureEstimate, p.currencyCode)}</strong></p>
    </div>
    {!p.complete && <p role="status">Total incompleto: revise acuerdos, cuentas y cotizaciones pendientes.</p>}
    <details><summary>Ver componentes y supuestos</summary>
      <dl><dt>Cobros pendientes</dt><dd>{money(p.pendingCollections, p.currencyCode)}</dd><dt>Pagos pendientes</dt><dd>{money(p.pendingPayments, p.currencyCode)}</dd><dt>Liquidaciones pendientes</dt><dd>{money(p.pendingSettlements, p.currencyCode)}</dd><dt>Liquidaciones previstas</dt><dd>{money(p.expectedSettlements, p.currencyCode)}</dd><dt>Participación adicional en cuotas</dt><dd>{money(p.additionalClubReceivables, p.currencyCode)}</dd></dl>
      <p>Calculado: {new Date(p.calculatedAt).toLocaleString('es-AR')}</p>{p.assumptions.map(a => <p key={a}>{a}</p>)}
    </details>
    {summaryOnly ? null : <>
      <p role="status" aria-live="polite">{message}</p>
      <label>Período <input type="month" value={month || data.month} max={data.today.slice(0, 7)} onChange={e => setMonth(e.target.value)} /></label>
      <p>Se incluyen las deudas anteriores. Aprobar, pagar y cerrar son operaciones independientes.</p>
      {data.diagnostics.length > 0 && <details open><summary>Acuerdos que requieren revisión ({data.diagnostics.length})</summary>{data.diagnostics.map((d, i) => <p key={`${d.activityId}-${i}`}>{d.message}</p>)}</details>}
      <div className="finance-table"><table><thead><tr><th>Período / actividad</th><th>Responsable</th><th>Ingresos</th><th>Devoluciones</th><th>Fijo</th><th>Pagado</th><th>Saldo</th><th>Revisión / cierre</th></tr></thead><tbody>
        {data.settlements.map(s => <tr key={s.id}><td>{s.month}<br />{s.activityName}</td><td>{s.personName}</td><td>{money(s.income, s.currencyCode)}</td><td>{money(s.refunds, s.currencyCode)}</td><td>{money(s.fixedClubFee, s.currencyCode)}</td><td>{money(s.payments, s.currencyCode)}</td><td>{money(s.balance, s.currencyCode)}<br />{s.balance < 0 ? 'Deuda del responsable' : s.paymentState === 'SETTLED' ? 'Saldado' : 'Pendiente'}</td><td>{({ DRAFT: 'Borrador', APPROVED: 'Aprobado', REQUIRES_REVIEW: 'Requiere revisión' })[s.reviewState]}{s.closedAt && ' · Cerrado'}
          {can(PERMISSIONS.FINANCE_REVIEW) && !s.initialObligationId && <form onSubmit={e => submit(e, f => mutate(`/api/finance/settlements/${s.id}/${formText(f, 'action')}`, { revision: s.revision, reason: formText(f, 'reason') }))}>
            <input aria-label={`Motivo de revisión ${s.activityName} ${s.month}`} name="reason" placeholder="Motivo de revisión" required /><select name="action" aria-label="Operación de liquidación"><option value="approve">Aprobar versión</option><option value="close" disabled={s.reviewState !== 'APPROVED' || s.month >= data.today.slice(0, 7)}>Cerrar mes</option></select><button disabled={busy}>Registrar</button>
          </form>}
        </td></tr>)}
      </tbody></table></div>
      {can(PERMISSIONS.FINANCE_PAY) && can(PERMISSIONS.SECTORS_ANY) && <details><summary>Pagar al responsable o cobrar su deuda</summary><form className="finance-form" onSubmit={e => submit(e, f => mutate(`/api/finance/responsibles/${formText(f, 'personId')}/pay`, { accountId: f.get('accountId'), amount: Number(f.get('amount')), date: f.get('date'), debtCollection: f.get('kind') === 'debt', reason: f.get('reason') }))}>
        {select('personId', 'Responsable', data.people)}{select('accountId', 'Cuenta', data.accounts.map(a => ({ id: a.id, name: `${a.name} (${a.currencyCode})` })))}
        <label>Operación<select name="kind"><option value="pay">Pagar saldo disponible</option><option value="debt">Cobrar deuda del responsable</option></select></label>
        <label>Importe<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Fecha<input name="date" type="date" defaultValue={data.today} required /></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>Registrar con compensación automática</button>
      </form></details>}
      {can(PERMISSIONS.FINANCE_CORRECT) && <details><summary>Responsables históricos y política del fijo</summary>{data.terms.map(t => <form key={`${t.id}-${t.revision}`} className="finance-form" onSubmit={e => submit(e, f => mutate(`/api/finance/terms/${t.id}/resolve`, { revision: t.revision, personId: f.get('personId'), partialMonthPolicy: t.mode === 'FIXED' ? f.get('policy') : null, distributions: f.get('fee') !== '' ? [{ month: f.get('month'), amount: Number(f.get('fee')) }] : [], reason: f.get('reason') }))}>
        <p>{t.activityName} · {t.effectiveFrom} — {t.effectiveTo || 'vigente'}</p>{select('personId', 'Responsable confirmado', data.people, true, t.personId || '')}
        {t.mode === 'FIXED' && <><label>Mes parcial<select name="policy" defaultValue={t.partialMonthPolicy || ''} required><option value="">Elegir política…</option><option value="CALENDAR_DAYS">Prorrateo por días calendario</option><option value="FULL_MONTH">Mes completo</option></select></label><label>Mes de distribución<input name="month" type="month" defaultValue={data.month} /></label><label>Parte acordada del fijo (opcional)<input name="fee" type="number" step="0.01" min="0" /></label></>}
        <label>Motivo<input name="reason" required /></label><button disabled={busy}>Guardar definición</button>
      </form>)}</details>}
      {wb && <>
        {can(PERMISSIONS.FINANCE_PAY) && can(PERMISSIONS.SECTORS_ANY) && <details><summary>Pagar saldos iniciales de empleados y proveedores</summary><form className="finance-form" onSubmit={e => submit(e,f => mutate(`/api/finance/initial-obligations/${formText(f,'obligationId')}/pay`,{ accountId:f.get('accountId'),amount:Number(f.get('amount')),date:f.get('date'),reason:f.get('reason') }))}>
          {select('obligationId','Obligación aprobada',wb.initialObligations.filter(o => o.id && o.reviewState==='APPROVED' && ['EMPLOYEE','SUPPLIER'].includes(o.kind) && (o.balance??0)>0).map(o => ({id:o.id!,name:`${data.people.find(p=>p.id===o.personId)?.name ?? o.sourceKey} · ${money(o.balance??0,o.currencyCode)}`})))}
          {select('accountId','Cuenta financiera',data.accounts)}<label>Importe<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Fecha<input name="date" type="date" defaultValue={data.today} max={data.today} required /></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>Registrar pago</button>
        </form></details>}
        <details><summary>Registrar o corregir un movimiento</summary>
          <label>Movimiento<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Nuevo movimiento</option>{wb.movements.map(m => <option key={m.id} value={m.id}>{m.movementDate} · {m.concept} · {m.amount}</option>)}</select></label>
          {(edit ? can(PERMISSIONS.FINANCE_CORRECT) : can(PERMISSIONS.MOVEMENTS_CREATE)) && <form key={`${selected}-${edit?.revision ?? 0}`} className="finance-form" onSubmit={e => submit(e, f => {
            const movement = { movementDate: f.get('movementDate'), movementType: f.get('movementType'), accountId: f.get('accountId'), categoryId: f.get('categoryId'), sectorId: f.get('sectorId'), activityId: f.get('activityId') || null, personId: f.get('personId') || null, paymentMethodId: f.get('paymentMethodId') || null, concept: f.get('concept'), counterpartyText: f.get('counterpartyText'), amount: Number(f.get('amount')), taxes: Number(f.get('taxes') || 0), operationalStatus: f.get('operationalStatus'), receivableId: f.get('receivableId') || null };
            return mutate(edit ? `/api/finance/movements/${edit.id}/correct` : '/api/finance/movements', { movement, ...(edit ? { revision: edit.revision } : {}), ...(f.get('receivableId') && f.get('operationalStatus') === 'COMPLETADO' ? { applications: [{ receivableId: f.get('receivableId'), amount: Number(f.get('amount')) }] } : {}), reason: f.get('reason') });
          })}>
            <label>Fecha<input type="date" name="movementDate" defaultValue={edit?.movementDate || data.today} required /></label><label>Tipo<select name="movementType" defaultValue={edit?.movementType || 'INGRESOS'}><option value="INGRESOS">Ingreso</option><option value="EGRESOS">Egreso</option></select></label>
            {select('accountId', 'Cuenta', data.accounts, true, edit?.accountId || '')}{select('categoryId', 'Categoría', wb.categories.map(c => ({ ...c, name: `${c.name} (${c.direction})` })), true, edit?.categoryId || '')}{select('sectorId', 'Sector', wb.sectors, true, edit?.sectorId || '')}{select('activityId', 'Actividad', wb.activities, false, edit?.activityId || '')}{select('personId', 'Persona', data.people, false, edit?.personId || '')}{select('paymentMethodId', 'Medio de pago', wb.methods, false, edit?.paymentMethodId || '')}
            {select('receivableId', 'Aplicar a cuota', wb.receivables.filter(r => r.balance > 0).map(r => ({ id: r.id, name: `${data.people.find(p => p.id === r.personId)?.name || ''} · ${r.concept} · ${money(r.balance, r.currencyCode)}` })), false, edit?.receivableId || '')}
            <label>Concepto<input name="concept" defaultValue={edit?.concept} required /></label><label>Contraparte<input name="counterpartyText" defaultValue={edit?.counterpartyText} required /></label><label>Importe<input name="amount" type="number" min="0.01" step="0.01" defaultValue={edit?.amount} required /></label><label>Impuestos<input name="taxes" type="number" min="0" step="0.01" defaultValue={edit?.taxes || 0} /></label>
            <label>Estado<select name="operationalStatus" defaultValue={edit?.operationalStatus || 'COMPLETADO'}><option>COMPLETADO</option><option>PENDIENTE</option>{edit && <option>ANULADO</option>}</select></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>{edit ? 'Guardar corrección auditada' : 'Registrar movimiento'}</button>
          </form>}
          {edit && can(PERMISSIONS.FINANCE_PAY) && edit.movementType === 'INGRESOS' && <form className="finance-form" onSubmit={e => submit(e, f => mutate(`/api/finance/movements/${edit.id}/refund`, { revision: edit.revision, amount: Number(f.get('amount')), accountId: f.get('accountId'), date: f.get('date'), reason: f.get('reason') }))}><h3>Devolver dinero del cobro seleccionado</h3>{select('accountId', 'Cuenta de devolución', data.accounts)}<label>Importe<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Fecha<input name="date" type="date" defaultValue={data.today} required /></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>Registrar devolución real</button></form>}
          {edit && can(PERMISSIONS.FINANCE_RECONCILE) && <form className="finance-form" onSubmit={e => submit(e, f => mutate(`/api/finance/movements/${edit.id}/reconcile`, { revision: edit.revision, reason: f.get('reason') }))}><p>{edit.reconciledAt ? 'Movimiento conciliado' : 'Pendiente de conciliación'}</p><label>Evidencia / motivo<input name="reason" required /></label><button disabled={busy}>Conciliar movimiento</button></form>}
        </details>
        <details><summary>Cuotas y baja de inscripciones</summary>
          {can(PERMISSIONS.ENROLLMENTS_CREATE) && <form className="finance-form" onSubmit={e => submit(e, f => mutate('/api/finance/receivables/generate', { month: f.get('month'), reason: f.get('reason') }))}><label>Mes<input name="month" type="month" defaultValue={data.month} required /></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>Generar cuotas del mes</button></form>}
          {can(PERMISSIONS.ENROLLMENTS_CANCEL) && <form className="finance-form" onSubmit={e => submit(e, f => mutate(`/api/finance/enrollments/${formText(f, 'enrollmentId')}/abandon`, { decision: f.get('decision'), reason: f.get('reason') }))}>{select('enrollmentId', 'Inscripción', wb.enrollments)}<label>Deuda existente<select name="decision" required defaultValue=""><option value="">Elegir…</option><option value="KEEP">Conservar deuda</option><option value="FORGIVE">Perdonar deuda</option></select></label><label>Motivo<input name="reason" required /></label><button disabled={busy}>Registrar abandono</button></form>}
        </details>
        {can(PERMISSIONS.FINANCE_RECONCILE) && can(PERMISSIONS.SECTORS_ANY) && <StartupForm data={data} workbench={wb} busy={busy} mutate={mutate} />}
      </>}
    </>}
  </section>;
}

function StartupForm({ data, workbench, busy, mutate }: { data: FinancialCircuit; workbench: Workbench; busy: boolean; mutate: (path: `/${string}`, body: unknown) => Promise<void> }) {
  const [obligations, setObligations] = useState<OpeningObligation[]>(() => workbench.initialObligations.length ? workbench.initialObligations : workbench.startup?.preview.obligations ?? []);
  return <details><summary>Arranque e importación conciliada</summary><p>Reconstrucción: saldo anterior y movimientos completos posteriores. Fecha de corte: saldos al cierre y sólo operaciones posteriores. La historia anterior permanece consultable.</p>
    <form className="finance-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void mutate('/api/finance/startup/preview', { mode: f.get('mode'), cutoffDate: f.get('cutoffDate'), accounts: data.accounts.map(a => ({ accountId: a.id, amount: Number(f.get(a.id)) })), obligations: obligations.map(o => ({ ...o, activityId: o.activityId || null })), reason: f.get('reason') }); }}>
      <label>Modalidad<select name="mode" defaultValue={workbench.startup?.mode || 'RECONSTRUCTION'}><option value="RECONSTRUCTION">Reconstrucción</option><option value="CUTOFF">Fecha de corte</option></select></label><label>Saldo al cierre de<input name="cutoffDate" type="date" defaultValue={workbench.startup?.cutoffDate || data.today} required /></label>
      {data.accounts.map(a => <label key={a.id}>Saldo esperado: {a.name} ({a.currencyCode})<input name={a.id} type="number" step="0.01" defaultValue={workbench.startup?.preview.accounts?.find(row => row.accountId === a.id)?.amount ?? 0} required /></label>)}
      <fieldset><legend>Obligaciones iniciales sin movimiento de caja</legend><p>Responsable: positivo si el club debe pagarle; negativo si debe al club. Alumnos: deuda positiva del alumno.</p>
        {obligations.map((o, i) => <div className="finance-form" key={i}>
          <label>Identificador de origen<input value={o.sourceKey} required onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, sourceKey: e.target.value } : r))} /></label>
          <label>Persona<select required value={o.personId} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, personId: e.target.value } : r))}><option value="">Seleccionar…</option>{data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Tipo<select value={o.kind} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, kind: e.target.value } : r))}><option value="STUDENT">Alumno</option><option value="RESPONSIBLE">Responsable</option><option value="EMPLOYEE">Empleado</option><option value="SUPPLIER">Proveedor</option></select></label>
          <label>Actividad<select value={o.activityId} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, activityId: e.target.value } : r))}><option value="">General</option>{workbench.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Moneda<select value={o.currencyCode} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, currencyCode: e.target.value } : r))}>{['ARS', 'USD', 'BRL', 'EUR'].map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Saldo<input type="number" step="0.01" required value={o.amount} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, amount: Number(e.target.value) } : r))} /></label><label>Vencimiento<input type="date" required value={o.dueDate} onChange={e => setObligations(rows => rows.map((r, n) => n === i ? { ...r, dueDate: e.target.value } : r))} /></label><button type="button" onClick={() => setObligations(rows => rows.filter((_, n) => n !== i))}>Quitar</button>
        </div>)}<button type="button" onClick={() => setObligations(rows => [...rows, { sourceKey: '', personId: '', activityId: '', kind: 'STUDENT', currencyCode: data.projection.currencyCode, amount: 0, dueDate: data.today }])}>Agregar obligación</button>
      </fieldset><label>Motivo<input name="reason" required /></label><button disabled={busy}>Preparar comparación</button>
    </form>
    {workbench.startup && <><p>Estado: {workbench.startup.status} · Versión {workbench.startup.revision}</p><div className="finance-table"><table><thead><tr><th>Cuenta</th><th>Esperado</th><th>Importado</th><th>Diferencia</th></tr></thead><tbody>{workbench.startup.preview.differences?.map(d => <tr key={d.accountId}><td>{data.accounts.find(a => a.id === d.accountId)?.name}</td><td>{d.expected}</td><td>{d.imported}</td><td>{d.difference}</td></tr>)}</tbody></table></div><form className="finance-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void mutate('/api/finance/startup/approve', { revision: workbench.startup!.revision, acceptDifferences: f.get('accept') === 'on', reason: f.get('reason') }); }}><label><input name="accept" type="checkbox" />Acepto explícitamente las diferencias indicadas</label><label>Motivo / evidencia<input name="reason" required /></label><button disabled={busy}>Aprobar saldos de arranque</button></form></>}
  </details>;
}
