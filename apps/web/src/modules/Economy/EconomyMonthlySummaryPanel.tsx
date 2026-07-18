import { formatEconomyMoney } from './formatters';
import type { EconomyDashboardCollection, EconomyMonthlyEvolutionItem } from './types';

type Props = { monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem> };
type Section = { title: string; tone: 'positive' | 'negative' | 'utility'; getValue: (item: EconomyMonthlyEvolutionItem) => number };

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long' });
const currentYear = new Date().getFullYear();
const monthName = (month: number) => {
  const label = monthFormatter.format(new Date(currentYear, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const safeMoney = (value: number) => formatEconomyMoney(Number.isFinite(value) ? value : 0);

const sections: Section[] = [
  { title: 'Ingresos', tone: 'positive', getValue: (item) => item.income ?? 0 },
  { title: 'Egresos / Gastos', tone: 'negative', getValue: (item) => item.expenses ?? 0 },
  { title: 'Utilidad', tone: 'utility', getValue: (item) => item.utility ?? item.balance ?? 0 },
];

export function EconomyMonthlySummaryPanel({ monthlyEvolution }: Props) {
  const byMonth = new Map(monthlyEvolution.items.map((item) => [item.month, item]));
  const months = Array.from({ length: 12 }, (_, index) => byMonth.get(index + 1) ?? {
    year: currentYear, month: index + 1, period: `${currentYear}-${String(index + 1).padStart(2, '0')}`,
    income: 0, expenses: 0, balance: 0, movements: 0, incomeVariation: null, expensesVariation: null, balanceVariation: null,
  });

  return (
    <article className="card home-kpi-card finance-card economy-monthly-summary-panel">
      <div className="home-card-heading finance-card__header"><h4>Resumen mensual económico</h4><p>Ingresos, egresos y utilidad del año corriente</p></div>
      <div className="economy-monthly-summary-panel__grid">
        {sections.map((section) => {
          const total = months.reduce((sum, item) => sum + section.getValue(item), 0);
          return (
            <div className={`economy-monthly-box economy-monthly-box--${section.tone}`} key={section.title}>
              <h5>{section.title}</h5>
              <div className="economy-monthly-box__rows">
                {months.map((item) => {
                  const value = section.getValue(item);
                  return <span className="economy-monthly-row" key={`${section.title}-${item.month}`}><strong>{monthName(item.month)}</strong><span className={value < 0 ? 'economy-chart-tooltip__negative' : value > 0 ? 'economy-chart-tooltip__positive' : undefined}>{safeMoney(value)}</span></span>;
                })}
                <span className="economy-monthly-row economy-monthly-row--total"><strong>TOTAL</strong><span>{safeMoney(total)}</span></span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
