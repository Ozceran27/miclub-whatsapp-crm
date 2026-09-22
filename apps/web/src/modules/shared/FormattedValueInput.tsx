import { useEffect, useRef, useState } from 'react';

type Props = { name: string; kind: 'money' | 'percent'; currency?: string; defaultValue?: number | null; required?: boolean; disabled?: boolean };
const thousands = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const symbol = (currency: string) => new Intl.NumberFormat('es-AR',{style:'currency',currency}).formatToParts(0).find(part=>part.type==='currency')?.value ?? currency;

export function FormattedValueInput({ name, kind, currency='ARS', defaultValue, required, disabled }:Props) {
  const [raw,setRaw]=useState(defaultValue == null ? '' : String(defaultValue).replace('.',','));
  const [error,setError]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{inputRef.current?.setCustomValidity(error);},[error]);
  const parsed=raw===''?null:Number(raw.replace(',','.'));
  const visible=raw===''?'':kind==='money' ? thousands.format(Number(raw)) : raw.replace('.',',');
  const change=(value:string)=>{
    if(kind==='money'){
      const digits=value.replace(/\D/g,'').slice(0,12);
      setRaw(digits); setError('');
    }else{
      const normalized=value.replace(/[^0-9,.]/g,'').replace('.',',');
      if(!/^\d{0,3}(,\d{0,2})?$/.test(normalized))return;
      setRaw(normalized);
      setError(Number(normalized.replace(',','.'))>100?'El porcentaje no puede superar el 100%.':'');
    }
  };
  return <span className="formatted-value">
    {kind==='money'&&<span className="formatted-value__affix" aria-hidden="true">{symbol(currency)}</span>}
    <input ref={inputRef} type="text" inputMode={kind==='money'?'numeric':'decimal'} value={visible} disabled={disabled} required={required}
      aria-label={kind==='money'?'Monto':'Porcentaje'} aria-invalid={Boolean(error)} onChange={event=>change(event.target.value)} />
    {kind==='percent'&&<span className="formatted-value__affix" aria-hidden="true">%</span>}
    <input type="hidden" name={name} value={parsed!=null&&Number.isFinite(parsed)&&!error?String(parsed):''}/>
    {error&&<small className="formatted-value__error" role="alert">{error}</small>}
  </span>;
}
