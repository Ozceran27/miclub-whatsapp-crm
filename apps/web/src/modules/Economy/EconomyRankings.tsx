import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEconomyMoney } from './formatters';
import type { EconomySectorBreakdownItem, EconomySectorRankings } from './types';
import { getSectorVisualMeta } from '../sectorVisualMeta';

type RankingCardProps = {
  title: string;
  subtitle: string;
  items: EconomySectorBreakdownItem[];
  accent: 'sector' | 'annual';
};

type Props = { sectorRankings: EconomySectorRankings };

type TooltipPayload = { payload?: EconomySectorBreakdownItem; value?: number };
type TooltipProps = { active?: boolean; payload?: TooltipPayload[] };

function RankingTooltip({ active, payload }: TooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="economy-chart-tooltip">
      <strong>{item.name}</strong>
      <span className={item.balance >= 0 ? 'economy-chart-tooltip__positive' : 'economy-chart-tooltip__negative'}>Rentabilidad: {formatEconomyMoney(item.balance)}</span>
      <span>Ingresos: {formatEconomyMoney(item.income)}</span>
      <span>Egresos: {formatEconomyMoney(item.expenses)}</span>
      <span>{item.movements} movimientos</span>
    </div>
  );
}

const getShortName = (name: string) => name.length > 16 ? `${name.slice(0, 15)}…` : name;
const rankingValueClass = (balance: number) => balance > 0 ? 'economy-ranking-item__value--positive' : balance < 0 ? 'economy-ranking-item__value--negative' : 'economy-ranking-item__value--neutral';

function RankingCard({ title, subtitle, items, accent }: RankingCardProps) {
  const chartData = items.map((item) => ({ ...item, shortName: getShortName(item.name) }));

  return (
    <article className={`card home-kpi-card finance-card economy-ranking-card economy-ranking-card--${accent}`}>
      <div className="home-card-heading finance-card__header">
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      {items.length > 0 ? (
        <>
          <div className="economy-ranking-chart" aria-label={`${title}: ranking agregado por rentabilidad`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 2 }}>
                <CartesianGrid stroke="rgba(143, 164, 200, 0.14)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="shortName" tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} width={96} />
                <Tooltip content={<RankingTooltip />} cursor={{ fill: 'rgba(143, 216, 255, 0.08)' }} />
                <Bar dataKey="balance" name="Rentabilidad" radius={[0, 8, 8, 0]} barSize={16}>
                  {chartData.map((item) => <Cell key={`${item.id ?? item.name}-${item.name}`} fill={item.balance >= 0 ? '#76f0c3' : '#ff6b7a'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="economy-ranking-list economy-ranking-list--compact">
            {items.map((item, index) => {
              const sectorMeta = getSectorVisualMeta(item.name);

              return (
                <li className={`economy-ranking-item economy-ranking-item--${sectorMeta.accent}`} key={`${item.id ?? item.name}-${index}`}>
                  <span className="economy-ranking-item__left">
                    <span className="economy-ranking-item__position">{index + 1}</span>
                    <span className="economy-ranking-item__sector-icon" aria-hidden="true">{sectorMeta.icon}</span>
                    <span className="economy-ranking-item__content">
                      <strong className="economy-ranking-item__title">{item.name}</strong>
                      <span className="economy-ranking-item__meta">
                        <span>{item.movements} mov.</span>
                        <span className="economy-ranking-item__meta-income">Ing. {formatEconomyMoney(item.income)}</span>
                        <span className="economy-ranking-item__meta-expense">Egr. {formatEconomyMoney(item.expenses)}</span>
                      </span>
                    </span>
                  </span>
                  <span className={`economy-ranking-item__value ${rankingValueClass(item.balance)}`}>{formatEconomyMoney(item.balance)}</span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="economy-chart-empty">Sin datos de rentabilidad por sector para el período.</p>
      )}
    </article>
  );
}

export function EconomyRankings({ sectorRankings }: Props) {
  return (
    <div className="economy-rankings-grid">
      <RankingCard title={`🏆 Ranking Sector mes de ${sectorRankings.monthly.label}`} subtitle="TOP 5 por rentabilidad del mes en curso" items={sectorRankings.monthly.items} accent="sector" />
      <RankingCard title="🥇 Ranking Sector Anual" subtitle={`TOP 5 por rentabilidad ${sectorRankings.annual.year} hasta hoy`} items={sectorRankings.annual.items} accent="annual" />
    </div>
  );
}
