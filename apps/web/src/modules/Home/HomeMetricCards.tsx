import type { FinancialLine, HomeDashboardState } from './useHomeDashboard';

type Props = Pick<HomeDashboardState, 'financialSummaryLines' | 'operationalBalanceLines' | 'incomeBySectorLines' | 'expenseBySectorLines' | 'financeError' | 'financeSummary'>;

const getMetricRowClassName = (highlight?: FinancialLine['highlight']) => {
  if (highlight === 'positiveCritical') return 'finance-metric-row finance-metric-row--highlight-critical finance-metric-row--highlight-positive-critical';
  if (highlight === 'negativeCritical') return 'finance-metric-row finance-metric-row--highlight-critical finance-metric-row--highlight-negative-critical';
  if (highlight === 'green') return 'finance-metric-row finance-metric-row--highlight-green';
  if (highlight === 'red') return 'finance-metric-row finance-metric-row--highlight-red';
  if (highlight === 'primarySoft') return 'finance-metric-row finance-metric-row--highlight-soft';
  if (highlight === 'default') return 'finance-metric-row finance-metric-row--highlight';
  return 'finance-metric-row';
};

const renderFinanceLines = (lines: FinancialLine[]) => (
  <div className="finance-lines finance-lines--compact">
    {lines.map((line) => (
      <span key={line.id ?? line.label} className={getMetricRowClassName(line.highlight)}>
        <strong className="finance-metric-row__label">{line.iconBefore ? `${line.iconBefore} ` : ''}{line.label}{line.iconAfter ? ` ${line.iconAfter}` : ''}</strong>
        <span className="finance-metric-row__value">{line.value}</span>
      </span>
    ))}
  </div>
);

export function HomeMetricCards({ financialSummaryLines, operationalBalanceLines, incomeBySectorLines, expenseBySectorLines, financeError, financeSummary }: Props) {
  return (
    <div className="home-dashboard-row home-dashboard-row--secondary">
      <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--summary">
        <div className="home-card-heading finance-card__header"><h4>📊 Resumen financiero</h4><p>Indicadores económicos actuales</p></div>
        {renderFinanceLines(financialSummaryLines)}
        {financeError && <small className="integration-note">{financeError}</small>}
      </article>
      <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--balance">
        <div className="home-card-heading finance-card__header"><h4>🏦 Saldos operativos</h4><p>Saldos y proyección operativa</p></div>
        {renderFinanceLines(operationalBalanceLines)}
        {financeError && <small className="integration-note">Pendiente de integración</small>}
      </article>
      <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--income">
        <div className="home-card-heading finance-card__header"><h4>📥 Ingresos por sector</h4><p>Sector · monto</p></div>
        {renderFinanceLines(incomeBySectorLines)}
        {financeSummary && financeSummary.remainingIncomeSectors > 0 && <small className="integration-note integration-note--future">+ {financeSummary.remainingIncomeSectors} sectores</small>}
        {financeError && <small className="integration-note">No disponible</small>}
      </article>
      <article className="card home-kpi-card home-kpi-card--compact finance-card finance-card--expense">
        <div className="home-card-heading finance-card__header"><h4>📤 Egresos por sector</h4><p>Sector · monto</p></div>
        {renderFinanceLines(expenseBySectorLines)}
        {financeSummary && financeSummary.remainingExpenseSectors > 0 && <small className="integration-note integration-note--future">+ {financeSummary.remainingExpenseSectors} sectores</small>}
        {financeError && <small className="integration-note">No disponible</small>}
      </article>
    </div>
  );
}
