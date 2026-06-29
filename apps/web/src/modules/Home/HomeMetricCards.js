import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
const getMetricRowClassName = (highlight) => {
    if (highlight === 'positiveCritical')
        return 'finance-metric-row finance-metric-row--highlight-critical finance-metric-row--highlight-positive-critical';
    if (highlight === 'negativeCritical')
        return 'finance-metric-row finance-metric-row--highlight-critical finance-metric-row--highlight-negative-critical';
    if (highlight === 'green')
        return 'finance-metric-row finance-metric-row--highlight-green';
    if (highlight === 'red')
        return 'finance-metric-row finance-metric-row--highlight-red';
    if (highlight === 'primarySoft')
        return 'finance-metric-row finance-metric-row--highlight-soft';
    if (highlight === 'default')
        return 'finance-metric-row finance-metric-row--highlight';
    return 'finance-metric-row';
};
const renderFinanceLines = (lines) => (_jsx("div", { className: "finance-lines finance-lines--compact", children: lines.map((line) => (_jsxs("span", { className: getMetricRowClassName(line.highlight), children: [_jsxs("strong", { className: "finance-metric-row__label", children: [line.iconBefore ? `${line.iconBefore} ` : '', line.label, line.iconAfter ? ` ${line.iconAfter}` : ''] }), _jsx("span", { className: "finance-metric-row__value", children: line.value })] }, line.id ?? line.label))) }));
export function HomeMetricCards({ financialSummaryLines, operationalBalanceLines, incomeBySectorLines, expenseBySectorLines, financeError, financeSummary }) {
    return (_jsxs("div", { className: "home-dashboard-row home-dashboard-row--secondary", children: [_jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--summary", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83D\uDCCA Resumen financiero" }), _jsx("p", { children: "Indicadores econ\u00F3micos actuales" })] }), renderFinanceLines(financialSummaryLines), financeError && _jsx("small", { className: "integration-note", children: financeError })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--balance", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83C\uDFE6 Saldos operativos" }), _jsx("p", { children: "Saldos y proyecci\u00F3n operativa" })] }), renderFinanceLines(operationalBalanceLines), financeError && _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n" })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--income", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83D\uDCE5 Ingresos por sector" }), _jsx("p", { children: "Sector \u00B7 monto" })] }), renderFinanceLines(incomeBySectorLines), financeSummary && financeSummary.remainingIncomeSectors > 0 && _jsxs("small", { className: "integration-note integration-note--future", children: ["+ ", financeSummary.remainingIncomeSectors, " sectores"] }), financeError && _jsx("small", { className: "integration-note", children: "No disponible" })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--expense", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83D\uDCE4 Egresos por sector" }), _jsx("p", { children: "Sector \u00B7 monto" })] }), renderFinanceLines(expenseBySectorLines), financeSummary && financeSummary.remainingExpenseSectors > 0 && _jsxs("small", { className: "integration-note integration-note--future", children: ["+ ", financeSummary.remainingExpenseSectors, " sectores"] }), financeError && _jsx("small", { className: "integration-note", children: "No disponible" })] })] }));
}
