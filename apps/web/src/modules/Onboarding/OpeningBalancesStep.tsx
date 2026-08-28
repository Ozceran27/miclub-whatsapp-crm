import type { OpeningBalancesRequest, OperationalCurrency } from '@miclub/shared';
import React, { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CurrencyFlag } from './CurrencyFlag';
import { CURRENCY_PRESENTATIONS, getCurrencyAfterKey, getCurrencyPrefix, getCurrencyPresentation } from './currencyPresentation';

type Values = Omit<OpeningBalancesRequest,'idempotencyKey'>;
export function OpeningBalancesStep({values,onChange}:{values:Values;onChange:(values:Values)=>void}) {
  const selectedCurrency=getCurrencyPresentation(values.currency) ?? CURRENCY_PRESENTATIONS[0];
  const change=(field:keyof Values,value:string)=>onChange({...values,[field]:field==='currency'?value:Number(value)});
  const [open,setOpen]=useState(false);
  const [activeCode,setActiveCode]=useState<OperationalCurrency>(()=>values.currency);
  const listboxId=useId();
  const buttonRef=useRef<HTMLButtonElement>(null);
  const rootRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{ if(!open) return; const close=(event:MouseEvent)=>{if(!rootRef.current?.contains(event.target as Node)) setOpen(false);}; document.addEventListener('mousedown',close); return()=>document.removeEventListener('mousedown',close); },[open]);
  useEffect(()=>{if(open) document.getElementById(`${listboxId}-${activeCode}`)?.focus();},[activeCode,listboxId,open]);
  const select=(code:OperationalCurrency)=>{change('currency',code);setActiveCode(code);setOpen(false);buttonRef.current?.focus();};
  const onButtonKeyDown=(event:KeyboardEvent<HTMLButtonElement>)=>{
    if(!['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)) return;
    event.preventDefault();
    if(event.key==='Enter'||event.key===' '){setOpen(value=>!value);return;}
    const code=getCurrencyAfterKey(values.currency,event.key as 'ArrowDown'|'ArrowUp'|'Home'|'End');setActiveCode(code);setOpen(true);
  };
  const onOptionKeyDown=(event:KeyboardEvent<HTMLLIElement>)=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();setActiveCode(getCurrencyAfterKey(activeCode,event.key as 'ArrowDown'|'ArrowUp'|'Home'|'End'));}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();select(activeCode);}
    else if(event.key==='Escape'){event.preventDefault();setOpen(false);buttonRef.current?.focus();}
    else if(event.key==='Tab') setOpen(false);
  };
  return <div className="setup-form opening-balances-form">
    <p>Registrá el capital anterior a miClub. Se asentará en las cuentas canónicas Caja, Banco y Caja USD; el libro contable seguirá siendo la única fuente del saldo.</p>
    <aside className="onboarding-balance-warning" role="note"><strong><span aria-hidden="true">⚠</span> Evitá duplicar tus saldos</strong><p>Los tres saldos son obligatorios y pueden ser cero. Si vas a importar capital histórico, ingresá cero en Caja, Cuenta Corriente y Dólares; este paso no se puede omitir.</p></aside>
    <div className="opening-balances-form__currency currency-listbox" ref={rootRef}>
      <span id={`${listboxId}-label`}>Moneda operativa</span><input type="hidden" name="currency" value={values.currency}/>
      <button ref={buttonRef} type="button" className="currency-listbox__trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} aria-labelledby={`${listboxId}-label ${listboxId}-value`} aria-activedescendant={open?`${listboxId}-${activeCode}`:undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={onButtonKeyDown}>
        <span id={`${listboxId}-value`} className="currency-option"><CurrencyFlag {...selectedCurrency}/><span className="currency-option__name">{selectedCurrency.name}</span><span className="currency-option__code">{selectedCurrency.code}</span></span><span aria-hidden="true">▾</span>
      </button>
      {open&&<ul id={listboxId} role="listbox" aria-labelledby={`${listboxId}-label`} className="currency-listbox__options">
        {CURRENCY_PRESENTATIONS.map(currency=><li id={`${listboxId}-${currency.code}`} key={currency.code} role="option" aria-selected={values.currency===currency.code} tabIndex={activeCode===currency.code?0:-1} data-active={activeCode===currency.code} onMouseEnter={()=>setActiveCode(currency.code)} onClick={()=>select(currency.code)} onKeyDown={onOptionKeyDown}><span className="currency-option"><CurrencyFlag {...currency}/><span className="currency-option__name">{currency.name}</span><span className="currency-option__code">{currency.code}</span></span></li>)}
      </ul>}
    </div>
    <label>Efectivo ({getCurrencyPrefix(values.currency)})<input name="cash" type="number" min="0" step="0.01" value={values.cash} onChange={event=>change('cash',event.target.value)} required /></label>
    <label>Cuenta Corriente ({getCurrencyPrefix(values.currency)})<input name="bank" type="number" min="0" step="0.01" value={values.bank} onChange={event=>change('bank',event.target.value)} required /></label>
    <label>Dólares ({getCurrencyPrefix('USD')})<input name="usdCash" type="number" min="0" step="0.01" value={values.usdCash} onChange={event=>change('usdCash',event.target.value)} required /></label>
  </div>;
}
