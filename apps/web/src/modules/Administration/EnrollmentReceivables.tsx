import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../../api';
import { useSession } from '../../session';

type Receivable = { id:string; concept:string; dueDate:string|null; amount:number; paidAmount:number; cancelledAmount:number; outstandingAmount:number; currencyCode:string; status:string };
type Page = { items:Receivable[]; total:number };
const formatMoney = (amount:number,currency:string) => new Intl.NumberFormat('es-AR',{style:'currency',currency}).format(amount);

export function EnrollmentReceivables({enrollmentId}:{enrollmentId:string}) {
  const {clubId}=useSession();
  const [page,setPage]=useState(1);
  const [data,setData]=useState<Page|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const load=useCallback(async(signal?:AbortSignal)=>{
    if(!clubId)return;
    setLoading(true);setError('');
    try { const result=await apiJson<Page>(`/api/finance/receivables?enrollmentId=${encodeURIComponent(enrollmentId)}&limit=10&offset=${(page-1)*10}`,{signal,cache:'no-store'});if(!signal?.aborted)setData(result); }
    catch(cause){if(!signal?.aborted){setData(null);setError(cause instanceof Error?cause.message:'No se pudieron cargar las cuotas.');}}
    finally{if(!signal?.aborted)setLoading(false);}
  },[enrollmentId,page,clubId]);
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>void load(controller.signal),0);const refresh=()=>void load();window.addEventListener('miclub:receivables-changed',refresh);return()=>{window.clearTimeout(timer);controller.abort();window.removeEventListener('miclub:receivables-changed',refresh);};},[load]);
  return <section className="enrollment-receivables" aria-label="Cuotas y deuda de la inscripción"><h3>Cuotas y deuda</h3>
    {loading?<p role="status">Consultando cuotas…</p>:error?<p role="alert">{error} <button type="button" onClick={()=>void load()}>Reintentar</button></p>:!data?.items.length?<p>Esta inscripción no tiene cuotas registradas.</p>:<><div className="finance-table"><table><thead><tr><th>Concepto</th><th>Vencimiento</th><th>Importe</th><th>Pagado</th><th>Cancelado</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.concept}</td><td>{item.dueDate??'Sin fecha'}</td><td>{formatMoney(item.amount,item.currencyCode)}</td><td>{formatMoney(item.paidAmount,item.currencyCode)}</td><td>{formatMoney(item.cancelledAmount,item.currencyCode)}</td><td><strong>{formatMoney(item.outstandingAmount,item.currencyCode)}</strong></td><td>{item.status}</td></tr>)}</tbody></table></div><nav className="paginated-list__pagination" aria-label="Páginas de cuotas"><button type="button" disabled={page<=1||loading} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page} de {Math.max(1,Math.ceil(data.total/10))}</span><button type="button" disabled={page*10>=data.total||loading} onClick={()=>setPage(page+1)}>Siguiente</button></nav></>}
  </section>;
}
