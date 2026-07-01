import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEconomyMoney } from './formatters';
import type { EconomyCategoryBreakdownItem, EconomyDashboardCollection, EconomySectorBreakdownItem } from './types';

type RankingItem = EconomySectorBreakdownItem | EconomyCategoryBreakdownItem;

type RankingCardProps<TItem extends RankingItem> = {
  title: string;
  subtitle: string;
  items: TItem[];
  accent: 'sector' | 'category';
};

type Props = {
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
};

type TooltipPayload = { payload?: RankingItem; value?: number };
type TooltipProps = { active?: boolean; payload?: TooltipPayload[] };

function RankingTooltip({ active, payload }: TooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="economy-chart-tooltip">
      <strong>{item.name}</strong>
      <span className={item.balance >= 0 ? 'economy-chart-tooltip__positive' : 'economy-chart-tooltip__negative'}>Balance: {formatEconomyMoney(item.balance)}</span>
      <span>Ingresos: {formatEconomyMoney(item.income)}</span>
      <span>Egresos: {formatEconomyMoney(item.expenses)}</span>
      <span>{item.movements} movimientos</span>
    </div>
  );
}

const getShortName = (name: string) => name.length > 16 ? `${name.slice(0, 15)}…` : name;

function RankingCard<TItem extends RankingItem>({ title, subtitle, items, accent }: RankingCardProps<TItem>) {
  const chartData = items.map((item) => ({ ...item, shortName: getShortName(item.name) }));

  return (
    <article className={`card home-kpi-card finance-card economy-ranking-card economy-ranking-card--${accent}`}>
      <div className="home-card-heading finance-card__header">
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      {items.length > 0 ? (
        <>
          <div className="economy-ranking-chart" aria-label={`${title}: ranking agregado por balance`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 2 }}>
                <CartesianGrid stroke="rgba(143, 164, 200, 0.14)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="shortName" tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} width={96} />
                <Tooltip content={<RankingTooltip />} cursor={{ fill: 'rgba(143, 216, 255, 0.08)' }} />
                <Bar dataKey="balance" name="Balance" radius={[0, 8, 8, 0]} barSize={16}>
                  {chartData.map((item) => <Cell key={`${item.id ?? item.name}-${item.name}`} fill={item.balance >= 0 ? '#76f0c3' : '#ff8787'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="economy-ranking-list economy-ranking-list--compact">
            {items.map((item, index) => (
              <li className="economy-ranking-item" key={`${item.id ?? item.name}-${index}`}>
                <span className="economy-ranking-item__position">{index + 1}</span>
                <span className="economy-ranking-item__content">
                  <strong className="economy-ranking-item__title">{item.name}</strong>
                  <span className="economy-ranking-item__meta">{item.movements} mov. · Ingresos {formatEconomyMoney(item.income)} · Egresos {formatEconomyMoney(item.expenses)}</span>
                </span>
                <span className="economy-ranking-item__value">{formatEconomyMoney(item.balance)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="economy-chart-empty">Sin datos agregados para el mes actual.</p>
      )}
    </article>
  );
}

export function EconomyRankings({ bySector, byCategory }: Props) {
  return (
    <div className="economy-rankings-grid">
      <RankingCard title="🏆 Ranking por sector" subtitle="Balance mensual agregado desde backend" items={bySector.items} accent="sector" />
      <RankingCard title="🥇 Ranking por categoría" subtitle="Ingresos, egresos y movimientos agregados" items={byCategory.items} accent="category" />
    </div>
  );
}
