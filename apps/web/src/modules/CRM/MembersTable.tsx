import type { CrmDebtPage, CrmMoney } from '@miclub/shared';

export const money=(balances:CrmMoney[])=>balances.length?balances.map(b=>`${b.amount.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${b.currencyCode}`).join(' · '):'—';
const date=(value:string|null)=>value?new Date(`${value}T12:00:00`).toLocaleDateString('es-AR'):'—';
type Props={debts:CrmDebtPage;selected:string[];setSelected:React.Dispatch<React.SetStateAction<string[]>>;pageChange:(page:number)=>void;loading:boolean};
export const MembersTable=({debts,selected,setSelected,pageChange,loading}:Props)=>{
  const visible=debts.items.filter(row=>row.kind==='overdue');
  const allSelected=visible.length>0&&visible.every(row=>selected.includes(row.enrollmentId));
  return <section className="section-panel" aria-label="Inscripciones y deuda">
    <div className="section-header"><div><h3>Inscripciones y vencimientos</h3><p>Deuda comprobada con cuotas generadas y pagos aplicados.</p></div></div>
    <div className="actions-row"><p><strong>Resultados:</strong> {debts.total} · <strong>Seleccionados:</strong> {selected.length}</p>
      <button className="icon-btn" disabled={!visible.length} onClick={()=>setSelected(current=>allSelected?current.filter(id=>!visible.some(row=>row.enrollmentId===id)):Array.from(new Set([...current,...visible.map(row=>row.enrollmentId)])))}>Seleccionar visibles</button>
      <button className="icon-btn ghost-btn" onClick={()=>setSelected([])}>Limpiar selección</button></div>
    {loading?<p>Cargando inscripciones…</p>:debts.items.length===0?<p>No hay resultados para estos filtros.</p>:<div className="members-table-wrap"><table className="members-table"><thead><tr>
      <th><span className="sr-only">Seleccionar</span></th><th>Inscripto</th><th>Teléfono</th><th>Sector / actividad</th><th>Inscripción</th><th>Primer vencimiento</th><th>Último vencimiento</th><th>Cuotas vencidas</th><th>Saldo</th><th>Último pago</th><th>Último contacto</th><th>Situación</th>
    </tr></thead><tbody>{debts.items.map(row=><tr key={row.enrollmentId}><td><input type="checkbox" aria-label={`Seleccionar ${row.firstName} ${row.lastName}`} disabled={row.kind!=='overdue'} checked={selected.includes(row.enrollmentId)} onChange={()=>setSelected(current=>current.includes(row.enrollmentId)?current.filter(id=>id!==row.enrollmentId):[...current,row.enrollmentId])}/></td>
      <td>{row.firstName} {row.lastName}</td><td>{row.phone||'Sin teléfono'}</td><td>{row.sectorName} / {row.activityName}</td>
      <td>{date(row.enrollmentDate)}</td><td>{date(row.firstDueDate)}</td><td>{date(row.lastDueDate)}</td><td>{row.overdueCount}</td><td>{money(row.balances)}</td>
      <td>{row.lastPaymentAt?new Date(row.lastPaymentAt).toLocaleDateString('es-AR'):'—'}</td><td>{row.lastContactAt?new Date(row.lastContactAt).toLocaleDateString('es-AR'):'—'}</td>
      <td>{row.kind==='overdue'?'Cuota vencida':'Revisar: sin cuota generada o sin fecha'}</td></tr>)}</tbody></table></div>}
    <div className="history-pagination"><button className="icon-btn ghost-btn" disabled={debts.page<=1} onClick={()=>pageChange(debts.page-1)}>Anterior</button>
      <span>Página {debts.page} de {Math.max(1,Math.ceil(debts.total/debts.pageSize))}</span>
      <button className="icon-btn ghost-btn" disabled={debts.page*debts.pageSize>=debts.total} onClick={()=>pageChange(debts.page+1)}>Siguiente</button></div>
  </section>;
};
