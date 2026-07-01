import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatEconomyMoney } from './formatters';
import type { EconomyDashboardCollection, EconomyPaymentMethodItem } from './types';

type Props = { paymentMethods: EconomyDashboardCollection<EconomyPaymentMethodItem> };

type TooltipPayload = { payload?: EconomyPaymentMethodItem & { percentage: number }; value?: number };
type TooltipProps = { active?: boolean; payload?: TooltipPayload[] };

const colors = ['#8fd8ff', '#76f0c3', '#ffad66', '#c59bff', '#ff8787', '#f7dc6f', '#7dd3fc'];

function PaymentTooltip({ active, payload }: TooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="economy-chart-tooltip">
      <strong>{item.name}</strong>
      <span>Monto neto: {formatEconomyMoney(item.amount)}</span>
      <span>Participación: {item.percentage.toFixed(1)}%</span>
      <span>{item.movements} movimientos</span>
    </div>
  );
}

export function EconomyPaymentMethodsChart({ paymentMethods }: Props) {
  const totalAmount = paymentMethods.items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const data = paymentMethods.items.map((item) => ({ ...item, amount: Math.abs(item.amount), percentage: totalAmount > 0 ? (Math.abs(item.amount) / totalAmount) * 100 : 0 }));

  return (
    <article className="card home-kpi-card finance-card economy-chart-card economy-chart-card--payments">
      <div className="home-card-heading finance-card__header">
        <h4>💳 Métodos de pago</h4>
        <p>Distribución mensual por monto neto completado</p>
      </div>
      {data.length > 0 && totalAmount > 0 ? (
        <div className="economy-payment-layout">
          <div className="economy-payment-chart" aria-label="Distribución de métodos de pago">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<PaymentTooltip />} />
                <Legend wrapperStyle={{ color: '#9fb4d8', fontSize: 12 }} />
                <Pie data={data} dataKey="amount" nameKey="name" innerRadius="54%" outerRadius="82%" paddingAngle={3} stroke="rgba(8,17,32,.86)" strokeWidth={2}>
                  {data.map((item, index) => <Cell key={item.id ?? item.name} fill={colors[index % colors.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="economy-payment-list">
            {data.map((item, index) => (
              <li key={item.id ?? item.name}>
                <span className="economy-payment-list__swatch" style={{ background: colors[index % colors.length] }} />
                <strong>{item.name}</strong>
                <span>{formatEconomyMoney(item.amount)} · {item.percentage.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="economy-chart-empty">Sin métodos de pago para el mes actual.</p>
      )}
    </article>
  );
}
