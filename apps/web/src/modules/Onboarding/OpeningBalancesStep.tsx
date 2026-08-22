import { SUPPORTED_OPERATIONAL_CURRENCIES, type OpeningBalancesRequest, type OperationalCurrency } from '@miclub/shared';

const currencyNames: Record<OperationalCurrency, string> = {
  ARS: 'Peso argentino (ARS)', USD: 'Dólar estadounidense (USD)',
  BRL: 'Real brasileño (BRL)', EUR: 'Euro (EUR)',
};
type Values = Omit<OpeningBalancesRequest,'idempotencyKey'>;
export function OpeningBalancesStep({values,onChange}:{values:Values;onChange:(values:Values)=>void}) {
  const change=(field:keyof Values,value:string)=>onChange({...values,[field]:field==='currency'?value:Number(value)});
  return <div className="setup-form opening-balances-form">
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
  </div>;
}
