import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEconomyMoney } from './formatters';
import type { EconomyDashboardCollection, EconomyMonthlyEvolutionItem } from './types';

type Props = { monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem> };

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short' });

const getMonthLabel = (item: EconomyMonthlyEvolutionItem) => {
  const date = new Date(item.year, item.month - 1, 1);
  if (Number.isNaN(date.getTime())) return item.period;
  return monthFormatter.format(date);
};

type TooltipPayload = { payload?: { balance: number; label: string; year: number } };
type TooltipProps = { active?: boolean; payload?: TooltipPayload[] };

function EconomyProfitTooltip({ active, payload }: TooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="economy-chart-tooltip">
      <strong>{item.label} {item.year}</strong>
      <span className={item.balance >= 0 ? 'economy-chart-tooltip__positive' : 'economy-chart-tooltip__negative'}>
        Utilidad: {formatEconomyMoney(item.balance)}
      </span>
    </div>
  );
}

export function EconomyProfitChart({ monthlyEvolution }: Props) {
  const data = monthlyEvolution.items.map((item) => ({ ...item, label: getMonthLabel(item) }));

  return (
    <article className="card home-kpi-card finance-card economy-chart-card economy-chart-card--profit">
      <div className="home-card-heading finance-card__header">
        <h4>💹 Utilidad mensual</h4>
        <p>Verde positivo · rojo negativo</p>
      </div>
      {data.length > 0 ? (
        <div className="economy-chart-card__canvas" aria-label="Gráfico de utilidad mensual positiva o negativa">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(143, 164, 200, 0.16)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} tickFormatter={(value: number) => formatEconomyMoney(Number(value))} width={86} />
              <ReferenceLine y={0} stroke="rgba(244, 248, 255, 0.34)" />
              <Tooltip content={<EconomyProfitTooltip />} cursor={{ fill: 'rgba(143, 216, 255, 0.08)' }} />
              <Bar dataKey="balance" name="Utilidad" radius={[8, 8, 8, 8]} barSize={24}>
                {data.map((item) => <Cell key={item.period} fill={item.balance >= 0 ? '#76f0c3' : '#ff6b7a'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="economy-chart-empty">Sin utilidad mensual disponible.</p>
      )}
    </article>
  );
}
