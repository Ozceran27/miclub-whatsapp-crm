import { formatEconomyMoney } from './formatters';
import type { EconomyCategoryBreakdownItem, EconomyDashboardCollection, EconomySectorBreakdownItem, EconomySectorRankings } from './types';

type RankingItem = EconomySectorBreakdownItem | EconomyCategoryBreakdownItem;
type Props = { sectorRankings: EconomySectorRankings; byCategory?: EconomyDashboardCollection<EconomyCategoryBreakdownItem>; currencyCode?: string };

function RankingCard({ title, subtitle, items, currencyCode = 'ARS' }: { title: string; subtitle: string; items: RankingItem[]; currencyCode?: string }) {
  return <article className="card home-kpi-card finance-card economy-ranking-card">
    <div className="home-card-heading finance-card__header"><h4>{title}</h4><p>{subtitle}</p></div>
    {items.length === 0 ? <p className="economy-chart-empty">Sin movimientos operativos completados para este período.</p> :
      <ol className="economy-ranking-list economy-ranking-list--compact">
        {items.slice(0, 6).map((item, index) => <li className="economy-ranking-item" key={`${item.id ?? item.name}-${index}`}>
          <span className="economy-ranking-item__left"><span className="economy-ranking-item__position">{index + 1}</span><span className="economy-ranking-item__content"><strong className="economy-ranking-item__title">{item.name}</strong><span className="economy-ranking-item__meta">{item.movements} mov. · Ingresos {formatEconomyMoney(item.income, currencyCode)} · Egresos {formatEconomyMoney(item.expenses, currencyCode)}</span></span></span>
          <span className={`economy-ranking-item__value ${item.balance === null ? 'economy-ranking-item__value--neutral' : item.balance > 0 ? 'economy-ranking-item__value--positive' : item.balance < 0 ? 'economy-ranking-item__value--negative' : 'economy-ranking-item__value--neutral'}`}>{formatEconomyMoney(item.balance, currencyCode)}</span>
        </li>)}
      </ol>}
  </article>;
}

export function EconomyRankings({ sectorRankings, byCategory, currencyCode }: Props) {
  return <>
    <div className="economy-rankings-grid">
      <RankingCard title={`🏆 Ranking por sector · ${sectorRankings.monthly.label}`} subtitle="Balance mensual de movimientos operativos" items={sectorRankings.monthly.items} currencyCode={currencyCode} />
      {byCategory && <RankingCard title="🏅 Ranking por categoría" subtitle="Balance mensual de movimientos operativos" items={byCategory.items} currencyCode={currencyCode} />}
    </div>
    <div className="economy-rankings-grid economy-rankings-grid--annual"><RankingCard title={`🏆 Ranking sectorial anual · ${sectorRankings.annual.year}`} subtitle="Balance acumulado del año hasta hoy" items={sectorRankings.annual.items} currencyCode={currencyCode} /></div>
  </>;
}
