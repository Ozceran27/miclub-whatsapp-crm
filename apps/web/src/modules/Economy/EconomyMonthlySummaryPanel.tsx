import React from 'react';
import { formatEconomyMoney } from './formatters';
import type { EconomyDashboardCollection, EconomyMonthlyEvolutionItem } from './types';

type Props = { monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>; year: number; currencyCode?: string };
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long' });
const sections = [
  { title: 'Ingresos', tone: 'positive', field: 'income' },
  { title: 'Egresos / Gastos', tone: 'negative', field: 'expenses' },
  { title: 'Utilidad', tone: 'utility', field: 'balance' },
] as const;

export function EconomyMonthlySummaryPanel({ monthlyEvolution, year, currencyCode = 'ARS' }: Props) {
  const byMonth = new Map(monthlyEvolution.items.map(item => [item.month, item]));
  const months = Array.from({ length: 12 }, (_, index) => byMonth.get(index + 1));
  const blocks = Array.from({ length: 3 }, (_, index) => months.slice(index * 4, index * 4 + 4));
  return <article className="card home-kpi-card finance-card economy-monthly-summary-panel">
    <div className="home-card-heading finance-card__header"><h4>Resumen mensual económico</h4><p>Ingresos, egresos y utilidad de {year} · {currencyCode}</p></div>
    <div className="economy-monthly-summary-panel__grid">{sections.map(section => {
      const values = months.map(item => item?.[section.field] ?? (item ? null : 0));
      const total = values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      return <div className={`economy-monthly-box economy-monthly-box--${section.tone}`} key={section.title}>
        <h5>{section.title}</h5><div className="economy-monthly-box__table" role="table" aria-label={`${section.title} por mes`}><div className="economy-monthly-box__blocks" role="rowgroup">
          {blocks.map((block, blockIndex) => <div className="economy-monthly-block" key={blockIndex} role="presentation"><div className="economy-monthly-block__head" role="row"><span>Mes</span><span>Valor</span></div>
            {block.map((item, itemIndex) => { const month = blockIndex * 4 + itemIndex + 1; const value = item?.[section.field] ?? (item ? null : 0); const label = monthFormatter.format(new Date(year, month - 1, 1)); return <div className="economy-monthly-row" role="row" key={month}><strong>{label.charAt(0).toUpperCase() + label.slice(1)}</strong><span className={section.tone === 'negative' ? 'economy-monthly-row__value--expense' : value !== null && value < 0 ? 'economy-chart-tooltip__negative' : 'economy-chart-tooltip__positive'}>{formatEconomyMoney(value, currencyCode)}</span></div>; })}
          </div>)}
        </div><div className="economy-monthly-row economy-monthly-row--total" role="row"><strong>TOTAL</strong><span>{formatEconomyMoney(total, currencyCode)}</span></div></div>
      </div>;
    })}</div>
  </article>;
}
