import { formatEconomyMoney } from './formatters';
import type { EconomyPaymentMethodItem, EconomyPaymentMethodsSummary } from './types';

type Props = { paymentMethods: EconomyPaymentMethodsSummary };

const colors = ['#8fd8ff', '#76f0c3', '#ffad66', '#c59bff', '#ff8787', '#f7dc6f', '#7dd3fc'];

const safePercentage = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const getTone = (value: number) => value > 0 ? 'economy-finance-value--positive' : value < 0 ? 'economy-finance-value--negative' : 'economy-finance-value--neutral';

function PaymentRows({ items, emptyLabel }: { items: EconomyPaymentMethodItem[]; emptyLabel: string }) {
  return items.length > 0 ? (
    <ul className="economy-payment-list economy-payment-list--compact">
      {items.map((item, index) => (
        <li key={item.id ?? item.name}>
          <span className="economy-payment-list__swatch" style={{ background: colors[index % colors.length] }} />
          <strong>{item.name}</strong>
          <span>{formatEconomyMoney(item.amount)} · {safePercentage(item.percentage).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  ) : <p className="economy-chart-empty">{emptyLabel}</p>;
}

function PeriodValue({ label, value, className }: { label: string; value: number; className?: string }) {
  return <span className="economy-finance-row"><strong>{label}</strong><span className={className ?? getTone(value)}>{formatEconomyMoney(value)}</span></span>;
}

export function EconomyPaymentMethodsChart({ paymentMethods }: Props) {
  const monthlyPayments = paymentMethods.monthly?.items ?? paymentMethods.items ?? [];
  const annualPayments = paymentMethods.annual?.items ?? [];
  const nonOperating = paymentMethods.nonOperatingExpenses;
  const servicesAndTaxes = paymentMethods.servicesAndTaxes;
  const status = paymentMethods.statusCounts ?? { completed: 0, pending: 0, canceled: 0 };

  return (
    <div className="economy-finance-triptych" aria-label="Indicadores complementarios de Economía Club">
      <article className="card home-kpi-card finance-card economy-mini-finance-card economy-mini-finance-card--expenses">
        <div className="home-card-heading finance-card__header">
          <h4>⚠️ Gastos no Operativos</h4>
          <p>EGRESOS completados de categorías no operativas</p>
        </div>
        <div className="economy-finance-section">
          <PeriodValue label="Mes actual" value={nonOperating?.monthly.amount ?? 0} className="economy-finance-value--negative" />
          <PeriodValue label="Acumulado anual" value={nonOperating?.annual.amount ?? 0} className="economy-finance-value--negative" />
          <span className="economy-finance-row economy-finance-row--muted"><strong>Movimientos</strong><span>{nonOperating?.monthly.movements ?? 0} mes · {nonOperating?.annual.movements ?? 0} año</span></span>
        </div>
      </article>

      <article className="card home-kpi-card finance-card economy-mini-finance-card economy-mini-finance-card--services">
        <div className="home-card-heading finance-card__header">
          <h4>🧾 Servicios e Impuestos</h4>
          <p>Balance = ingresos menos egresos completados</p>
        </div>
        <div className="economy-finance-section economy-finance-section--split">
          <div>
            <strong className="economy-finance-subtitle">Servicios</strong>
            <PeriodValue label="Mes actual" value={servicesAndTaxes?.services.monthly ?? 0} />
            <PeriodValue label="Acumulado anual" value={servicesAndTaxes?.services.annual ?? 0} />
          </div>
          <div>
            <strong className="economy-finance-subtitle">Impuestos</strong>
            <PeriodValue label="Mes actual" value={servicesAndTaxes?.taxes.monthly ?? 0} />
            <PeriodValue label="Acumulado anual" value={servicesAndTaxes?.taxes.annual ?? 0} />
          </div>
        </div>
      </article>

      <article className="card home-kpi-card finance-card economy-mini-finance-card economy-chart-card--payments">
        <div className="home-card-heading finance-card__header">
          <h4>💳 Métodos de Pago</h4>
          <p>INGRESOS completados por medio de pago</p>
        </div>
        <div className="economy-payment-periods">
          <section><strong className="economy-finance-subtitle">Mes actual</strong><PaymentRows items={monthlyPayments} emptyLabel="Sin ingresos del mes actual." /></section>
          <section><strong className="economy-finance-subtitle">Acumulado anual</strong><PaymentRows items={annualPayments} emptyLabel="Sin ingresos del año actual." /></section>
        </div>
        <div className="economy-status-badges" aria-label="Estados de movimientos del mes actual">
          <span>Completados: {status.completed}</span>
          <span>Pendientes: {status.pending}</span>
          <span>Anulados: {status.canceled}</span>
        </div>
      </article>
    </div>
  );
}
