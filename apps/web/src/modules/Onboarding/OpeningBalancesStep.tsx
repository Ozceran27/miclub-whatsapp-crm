import { SUPPORTED_OPERATIONAL_CURRENCIES, type OperationalCurrency } from '@miclub/shared';
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { saveOpeningBalances } from '../../services/api/onboardingApi';
import { useStepPersistence } from './StepPersistence';

const currencyNames: Record<OperationalCurrency, string> = {
  ARS: 'Peso argentino (ARS)', USD: 'Dólar estadounidense (USD)',
  BRL: 'Real brasileño (BRL)', EUR: 'Euro (EUR)',
};
type Values = { currency: '' | OperationalCurrency; cash: string; bank: string; usdCash: string };
const initialValues: Values = { currency: '', cash: '0', bank: '0', usdCash: '0' };
const isNonNegativeAmount = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

export function OpeningBalancesStep() {
  const [values,setValues]=useState(initialValues); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [batchId,setBatchId]=useState<string|null>(null);
  const idempotencyKey=useRef(crypto.randomUUID()); const valid=Boolean(values.currency)&&[values.cash,values.bank,values.usdCash].every(isNonNegativeAmount); const saved=batchId!==null;
  const save=useCallback(async()=>{if(!valid||!values.currency)throw new Error('Elegí una moneda e ingresá importes no negativos.');setSaving(true);setMessage('');try{const response=await saveOpeningBalances({currency:values.currency,cash:Number(values.cash),bank:Number(values.bank),usdCash:Number(values.usdCash),idempotencyKey:idempotencyKey.current});setBatchId(response.batchId);setMessage('Saldos de apertura registrados como capital. Ya podés continuar.');}catch(error){const text=error instanceof Error?error.message:'No se pudieron registrar los saldos.';setMessage(text);throw error;}finally{setSaving(false);}},[valid,values]);
  const persistence=useMemo(()=>({save:()=>Promise.resolve(),canContinue:valid&&saved,valid,saved,batchId}),[valid,saved,batchId]); useStepPersistence(persistence);
  const change=(field:keyof Values,value:string)=>{if(saved){idempotencyKey.current=crypto.randomUUID();setBatchId(null);setMessage('');}setValues(current=>({...current,[field]:value}));};
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void save().catch(()=>undefined);};
  return <form className="setup-form opening-balances-form" onSubmit={submit}>
    <p>Registrá el capital anterior a miClub. Se asentará en las cuentas canónicas Caja, Banco y Caja USD; el libro contable seguirá siendo la única fuente del saldo.</p>
    <aside className="onboarding-balance-warning" role="note"><strong><span aria-hidden="true">⚠</span> Evitá duplicar tus saldos</strong><p>Si vas a importar el historial completo de movimientos, omití este paso. Si cargás capital inicial y luego importás ese mismo historial, los saldos quedarán duplicados.</p></aside>
    <label className="opening-balances-form__currency">Moneda operativa
      <select name="currency" value={values.currency} onChange={event=>change('currency',event.target.value)} required aria-required="true">
        <option value="" disabled>Seleccioná una moneda</option>
        {SUPPORTED_OPERATIONAL_CURRENCIES.map(currency=><option key={currency} value={currency}>{currencyNames[currency]}</option>)}
      </select>
    </label>
    <label>Efectivo ({values.currency||'moneda operativa'})<input name="cash" type="number" min="0" step="0.01" value={values.cash} onChange={event=>change('cash',event.target.value)} required /></label>
    <label>Cuenta Corriente ({values.currency||'moneda operativa'})<input name="bank" type="number" min="0" step="0.01" value={values.bank} onChange={event=>change('bank',event.target.value)} required /></label>
    <label>Dólares (USD)<input name="usdCash" type="number" min="0" step="0.01" value={values.usdCash} onChange={event=>change('usdCash',event.target.value)} required /></label>
    <button type="submit" disabled={saving||!valid||saved}>{saving?'Registrando…':saved?'Saldos guardados':'Registrar saldos de apertura'}</button>
    {message&&<p role="status">{message}</p>}
  </form>;
}
