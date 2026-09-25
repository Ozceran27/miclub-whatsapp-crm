import { useEffect, useState } from 'react';
import { apiJson } from '../../api';

type Receivable = {id:string;concept:string;activityId:string|null;currencyCode:string;outstandingAmount:number;dueDate:string|null};
export type ReceivableApplication = {receivableId:string;amount:number};
export function MovementReceivableApplications({personId,activityId,currencyCode,value,onChange}:{personId:string;activityId:string;currencyCode:string;value:ReceivableApplication[];onChange:(value:ReceivableApplication[])=>void}) {
  const [items,setItems]=useState<Receivable[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  useEffect(()=>{if(!personId||!activityId||!currencyCode)return;const controller=new AbortController();
    const run=async()=>{const all:Receivable[]=[];for(let offset=0;;offset+=200){const page=await apiJson<{items:Receivable[];total:number}>(`/api/finance/receivables?personId=${encodeURIComponent(personId)}&activityId=${encodeURIComponent(activityId)}&currencyCode=${encodeURIComponent(currencyCode)}&limit=200&offset=${offset}`,{signal:controller.signal,cache:'no-store'});all.push(...page.items);if(!page.items.length||all.length>=page.total)break;}if(!controller.signal.aborted)setItems(all);};
    const timer=window.setTimeout(()=>{setLoading(true);setError('');setItems([]);void run().catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'No se pudieron consultar las cuotas.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},0);return()=>{window.clearTimeout(timer);controller.abort();};
  },[personId,activityId,currencyCode]);
  if(!personId||!activityId||!currencyCode)return <p>Para aplicar el cobro a cuotas, elegí persona, actividad y cuenta.</p>;
  const change=(id:string,amount:number)=>onChange([...value.filter(row=>row.receivableId!==id),...(amount>0?[{receivableId:id,amount}]:[])]);
  const visible=items.filter(item=>item.outstandingAmount>0||value.some(row=>row.receivableId===item.id));
  return <fieldset className="movement-applications"><legend>Aplicar ingreso a cuotas</legend>{loading?<p role="status">Consultando cuotas…</p>:error?<p role="alert">{error}</p>:visible.length===0?<p>Sin cuotas pendientes compatibles.</p>:visible.map(item=>{const current=value.find(row=>row.receivableId===item.id)?.amount??0;return <label key={item.id}><span>{item.concept} · {item.dueDate??'Sin vencimiento'} · disponible {new Intl.NumberFormat('es-AR',{style:'currency',currency:item.currencyCode}).format(item.outstandingAmount+current)}</span><input type="number" min="0" max={item.outstandingAmount+current} step="0.01" value={current||''} onChange={event=>change(item.id,Number(event.target.value))} aria-label={`Aplicar a ${item.concept}`}/></label>;})}</fieldset>;
}
