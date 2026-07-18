import React from 'react';
import { formatEconomyMoney } from './formatters';
import type { EconomyDashboardCollection, EconomyMonthlyEvolutionItem } from './types';

type Props = { monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem> };
type MonthlySummaryItem = EconomyMonthlyEvolutionItem & Record<string, unknown>;
type Section = { title: string; tone: 'positive' | 'negative' | 'utility'; getValue: (item: MonthlySummaryItem) => number };

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long' });
const currentYear = new Date().getFullYear();
const monthName = (month: number) => {
  const label = monthFormatter.format(new Date(currentYear, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const safeMoney = (value: number) => formatEconomyMoney(Number.isFinite(value) ? value : 0);
const numericValue = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
const firstNumericValue = (item: MonthlySummaryItem, keys: string[]): number => {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) return numericValue(item[key]);
  }
  return 0;
};

const sections: Section[] = [
  { title: 'Ingresos', tone: 'positive', getValue: (item) => firstNumericValue(item, ['income', 'ingresos', 'totalIncome', 'totalIngresos']) },
  { title: 'Egresos / Gastos', tone: 'negative', getValue: (item) => firstNumericValue(item, ['expenses', 'egresos', 'expense', 'gastos', 'totalExpenses', 'totalEgresos']) },
  { title: 'Utilidad', tone: 'utility', getValue: (item) => firstNumericValue(item, ['utility', 'balance', 'utilidad']) },
];

const emptyMonthlyItem = (month: number): MonthlySummaryItem => ({
  year: currentYear, month, period: `${currentYear}-${String(month).padStart(2, '0')}`,
  income: 0, expenses: 0, balance: 0, movements: 0, incomeVariation: null, expensesVariation: null, balanceVariation: null,
});

export function EconomyMonthlySummaryPanel({ monthlyEvolution }: Props) {
  const byMonth = new Map(monthlyEvolution.items.map((item) => [item.month, item as MonthlySummaryItem]));
  const months = Array.from({ length: 12 }, (_, index) => byMonth.get(index + 1) ?? emptyMonthlyItem(index + 1));
  const monthBlocks = Array.from({ length: 3 }, (_, index) => months.slice(index * 4, index * 4 + 4));

  return (
    <article className="card home-kpi-card finance-card economy-monthly-summary-panel">
      <div className="home-card-heading finance-card__header"><h4>Resumen mensual económico</h4><p>Ingresos, egresos y utilidad del año corriente</p></div>
      <div className="economy-monthly-summary-panel__grid">
        {sections.map((section) => {
          const total = months.reduce((sum, item) => sum + section.getValue(item), 0);
          return (
            <div className={`economy-monthly-box economy-monthly-box--${section.tone}`} key={section.title}>
              <h5>{section.title}</h5>
              <div className="economy-monthly-box__table" role="table" aria-label={`${section.title} por mes`}>
                <div className="economy-monthly-box__head" role="row"><span>Mes</span><span>Valor</span><span>Mes</span><span>Valor</span><span>Mes</span><span>Valor</span></div>
                {monthBlocks[0].map((firstBlockItem, index) => {
                  const rowItems = monthBlocks.map((block) => block[index]);
                  return (
                    <div className="economy-monthly-row" role="row" key={`${section.title}-${firstBlockItem.month}`}>
                      {rowItems.map((item) => {
                        const value = section.getValue(item);
                        const valueClass = section.tone === 'negative'
                          ? 'economy-monthly-row__value--expense'
                          : value < 0 ? 'economy-chart-tooltip__negative' : value > 0 ? 'economy-chart-tooltip__positive' : undefined;
                        return (
                          <React.Fragment key={`${section.title}-${item.month}`}>
                            <strong>{monthName(item.month)}</strong>
                            <span className={valueClass}>{safeMoney(value)}</span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })}
                <div className="economy-monthly-row economy-monthly-row--total" role="row"><strong>TOTAL</strong><span className={section.tone === 'negative' ? 'economy-monthly-row__value--expense' : undefined}>{safeMoney(total)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
