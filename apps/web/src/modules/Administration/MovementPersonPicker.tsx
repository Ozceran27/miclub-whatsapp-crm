import { useEffect, useState } from 'react';
import { apiJson } from '../../api';

type Person = {id:string;firstName:string;lastName:string;dni?:string|null};
export function MovementPersonPicker({value,onChange,initialLabel}:{value:string;onChange:(id:string)=>void;initialLabel?:string}) {
  const [search,setSearch]=useState('');
  const [items,setItems]=useState<Person[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();const timer=window.setTimeout(()=>{
    void apiJson<{items:Person[]}>(`/api/people?limit=50&search=${encodeURIComponent(search)}`,{signal:controller.signal}).then(result=>{setItems(result.items);setError('');}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'No se pudieron buscar personas.');});
  },250);return()=>{window.clearTimeout(timer);controller.abort();};},[search]);
  const selected=items.some(person=>person.id===value);
  return <div className="movement-person-picker"><label>Buscar persona<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nombre o DNI"/></label><label>Persona vinculada<select value={value} onChange={event=>onChange(event.target.value)}><option value="">Sin persona</option>{value&&!selected&&<option value={value}>{initialLabel||'Persona vinculada'}</option>}{items.map(person=><option key={person.id} value={person.id}>{`${person.firstName} ${person.lastName}`.trim()}{person.dni?` · ${person.dni}`:''}</option>)}</select></label>{error&&<p role="alert">{error}</p>}</div>;
}
