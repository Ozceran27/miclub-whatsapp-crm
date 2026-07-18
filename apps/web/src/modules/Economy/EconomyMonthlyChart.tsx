import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEconomyMoney } from './formatters';
import type { EconomyDashboardCollection, EconomyMonthlyEvolutionItem } from './types';

type Props = { monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem> };

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short' });

const getMonthLabel = (item: EconomyMonthlyEvolutionItem) => {
  const date = new Date(item.year, item.month - 1, 1);
  if (Number.isNaN(date.getTime())) return item.period;
  return `${monthFormatter.format(date)} ${String(item.year).slice(-2)}`;
};

const chartColors = { income: '#76f0c3', expenses: '#ffad66', balance: '#8fd8ff' };

type TooltipPayload = { name?: string; value?: number | string | null; color?: string; dataKey?: string; payload?: EconomyMonthlyEvolutionItem };

type TooltipProps = { active?: boolean; payload?: TooltipPayload[]; label?: string };

function EconomyChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="economy-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatEconomyMoney(typeof entry.value === 'number' ? entry.value : Number(entry.value ?? entry.payload?.[String(entry.dataKey ?? '') as keyof EconomyMonthlyEvolutionItem] ?? 0))}
        </span>
      ))}
    </div>
  );
}

export function EconomyMonthlyChart({ monthlyEvolution }: Props) {
  const data = monthlyEvolution.items.map((item) => ({ ...item, label: getMonthLabel(item) }));

  return (
    <article className="card home-kpi-card finance-card economy-chart-card economy-chart-card--wide">
      <div className="home-card-heading finance-card__header">
        <h4>📈 Evolución mensual</h4>
        <p>Ingresos, egresos y utilidad por mes</p>
      </div>
      {data.length > 0 ? (
        <div className="economy-chart-card__canvas" aria-label="Gráfico de ingresos, egresos y utilidad mensual">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(143, 164, 200, 0.16)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} tickFormatter={(value: number) => formatEconomyMoney(Number(value))} width={86} />
              <Tooltip content={<EconomyChartTooltip />} cursor={{ fill: 'rgba(143, 216, 255, 0.08)' }} />
              <Legend wrapperStyle={{ color: '#9fb4d8', fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="income" name="Ingresos" fill={chartColors.income} radius={[8, 8, 0, 0]} barSize={18} />
              <Bar dataKey="expenses" name="Egresos" fill={chartColors.expenses} radius={[8, 8, 0, 0]} barSize={18} />
              <Area type="monotone" dataKey="balance" name="Utilidad" stroke={chartColors.balance} fill="rgba(143, 216, 255, 0.16)" strokeWidth={3} dot={{ r: 3, fill: chartColors.balance }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="economy-chart-empty">Sin evolución mensual disponible.</p>
      )}
    </article>
  );
}
