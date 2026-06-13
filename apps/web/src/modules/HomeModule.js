import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { formatArPeso } from '../utils';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const STATUS_ALIASES = {
    'al dia': 'current',
    aldia: 'current',
    activo: 'current',
    activos: 'current',
    'nuevo inscripto': 'newEnrollment',
    nuevoinscripto: 'newEnrollment',
    'nuevo inscrito': 'newEnrollment',
    nuevoinscrito: 'newEnrollment',
    nuevo: 'newEnrollment',
    adeudando: 'debtor',
    deudor: 'debtor',
    deudores: 'debtor',
    deuda: 'debtor',
    abandonado: 'abandoned',
    abandonada: 'abandoned',
    abandono: 'abandoned',
    inactivo: 'abandoned',
    inactivos: 'abandoned'
};
const normalizeText = (value) => (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const formatDateTime = (value) => {
    if (!value)
        return 'Sin sincronización registrada';
    return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
const normalizeStatus = (status) => normalizeText(status)
    .replace(/[-–—_/]+/g, ' ')
    .replace(/[^a-z0-9ñ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const getStatusBucketFromRawStatus = (status) => {
    const normalized = normalizeStatus(status);
    const compact = normalized.replace(/\s/g, '');
    if (STATUS_ALIASES[normalized])
        return STATUS_ALIASES[normalized];
    if (STATUS_ALIASES[compact])
        return STATUS_ALIASES[compact];
    if (normalized.includes('nuevo') && (normalized.includes('inscripto') || normalized.includes('inscrito')))
        return 'newEnrollment';
    if (normalized.includes('abandon'))
        return 'abandoned';
    if (normalized.includes('adeud') || normalized.includes('deud'))
        return 'debtor';
    if (normalized.includes('al dia') || compact.includes('aldia'))
        return 'current';
    return undefined;
};
const getMemberStatus = (member) => normalizeStatus(String(member.estado ?? ''));
const getStatusBucket = (member) => getStatusBucketFromRawStatus(getMemberStatus(member));
const isActiveMember = (member) => getStatusBucket(member) !== 'abandoned';
const parseMemberFee = (value) => {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[^0-9,-]/g, '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};
const calculateWeightedAverageFee = (records) => {
    const activeMembersWithFee = records
        .map((member) => ({ member, fee: parseMemberFee(member.cuota) }))
        .filter(({ member, fee }) => isActiveMember(member) && fee > 0);
    if (activeMembersWithFee.length === 0)
        return undefined;
    const totalFees = activeMembersWithFee.reduce((total, { fee }) => total + fee, 0);
    return totalFees / activeMembersWithFee.length;
};
const isDebtor = (member) => getStatusBucket(member) === 'debtor';
const getActivityName = (member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';
const getEnrollmentStatusBreakdown = (records, fallbackTotal) => {
    const breakdown = {
        total: records.length || fallbackTotal || 0,
        active: 0,
        current: 0,
        newEnrollment: 0,
        debtor: 0,
        abandoned: 0,
        others: 0
    };
    records.forEach((member) => {
        const bucket = getStatusBucket(member);
        if (bucket === 'current')
            breakdown.current += 1;
        if (bucket === 'newEnrollment')
            breakdown.newEnrollment += 1;
        if (bucket === 'debtor')
            breakdown.debtor += 1;
        if (bucket === 'abandoned')
            breakdown.abandoned += 1;
        if (!bucket)
            breakdown.others += 1;
    });
    breakdown.active = breakdown.total - breakdown.abandoned;
    return breakdown;
};
const mapSummaryStatusBreakdown = (statusBreakdown) => {
    if (!statusBreakdown)
        return undefined;
    return {
        total: statusBreakdown.total,
        active: statusBreakdown.active,
        current: statusBreakdown.alDia,
        newEnrollment: statusBreakdown.nuevoInscripto,
        debtor: statusBreakdown.adeudando,
        abandoned: statusBreakdown.abandonado,
        others: statusBreakdown.otros
    };
};
const buildActivityBreakdown = (records) => {
    const counts = new Map();
    records.forEach((member) => {
        const activity = getActivityName(member);
        counts.set(activity, (counts.get(activity) ?? 0) + 1);
    });
    return Array.from(counts.entries())
        .map(([activity, count]) => ({ activity, count }))
        .sort((a, b) => b.count - a.count || a.activity.localeCompare(b.activity, 'es'));
};
const buildActiveActivityBreakdown = (records) => buildActivityBreakdown(records.filter(isActiveMember));
const buildDebtorActivityBreakdown = (records) => buildActivityBreakdown(records.filter(isDebtor));
const renderActivityBreakdown = (items, maxCount, emptyLabel, highlightFirst = false) => (items.length > 0 ? items.map((item, index) => {
    const isHighlighted = Boolean(highlightFirst) && index === 0;
    const highlightClass = highlightFirst === 'warning'
        ? 'activity-breakdown-item--warning'
        : 'activity-breakdown-item--highlight';
    const className = isHighlighted
        ? `activity-breakdown-item ${highlightClass}`
        : 'activity-breakdown-item';
    const marker = isHighlighted && highlightFirst === 'warning' ? '⚠ ' : '';
    const suffix = highlightFirst === 'featured' ? ' ⭐' : '';
    return (_jsxs("div", { className: className, children: [_jsxs("div", { className: "activity-breakdown-row", children: [_jsxs("span", { children: [marker, item.activity, isHighlighted ? suffix : ''] }), _jsx("strong", { children: item.count })] }), _jsx("div", { className: "activity-breakdown-track", "aria-hidden": "true", children: _jsx("span", { style: { width: `${Math.max((item.count / maxCount) * 100, 8)}%` } }) })] }, item.activity));
}) : _jsx("p", { className: "empty-card-note", children: emptyLabel }));
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
export default function HomeModule({ onOpenModule }) {
    const [summary, setSummary] = useState(null);
    const [members, setMembers] = useState([]);
    const [debtors, setDebtors] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);
    const [financeSummary, setFinanceSummary] = useState(null);
    const [sectorSummary, setSectorSummary] = useState(null);
    const [financeError, setFinanceError] = useState(null);
    const [sectorError, setSectorError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const loadHome = async () => {
        setLoading(true);
        setError(null);
        setFinanceError(null);
        setSectorError(null);
        try {
            const financePromise = fetch(`${API}/club-finance-summary`)
                .then(async (response) => {
                if (!response.ok)
                    throw new Error('No se pudo cargar el resumen financiero.');
                return response.json();
            })
                .catch((financeLoadError) => {
                setFinanceError(financeLoadError instanceof Error ? financeLoadError.message : 'Resumen financiero no disponible.');
                return null;
            });
            const sectorPromise = fetch(`${API}/sector-operational-summary`)
                .then(async (response) => {
                if (!response.ok)
                    throw new Error('No se pudo cargar el resumen operativo por sector.');
                return response.json();
            })
                .catch((sectorLoadError) => {
                setSectorError(sectorLoadError instanceof Error ? sectorLoadError.message : 'Resumen operativo por sector no disponible.');
                return null;
            });
            const [summaryRes, membersRes, debtorsRes, syncRes, financePayload, sectorPayload] = await Promise.all([
                fetch(`${API}/summary`),
                fetch(`${API}/members`),
                fetch(`${API}/debtors`),
                fetch(`${API}/sync-status`),
                financePromise,
                sectorPromise
            ]);
            if (!summaryRes.ok || !membersRes.ok || !debtorsRes.ok || !syncRes.ok) {
                throw new Error('No se pudo cargar el inicio operativo.');
            }
            const [summaryPayload, membersPayload, debtorsPayload, syncPayload] = await Promise.all([
                summaryRes.json(),
                membersRes.json(),
                debtorsRes.json(),
                syncRes.json()
            ]);
            setSummary(summaryPayload);
            setMembers(membersPayload);
            setDebtors(debtorsPayload);
            setSyncStatus(syncPayload);
            setFinanceSummary(financePayload);
            setSectorSummary(sectorPayload);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido al cargar el inicio.');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void loadHome();
    }, []);
    const syncLabel = !syncStatus
        ? 'No disponible'
        : syncStatus.error
            ? 'Con advertencias'
            : syncStatus.source === 'google_sheets'
                ? 'Google Sheets conectado'
                : 'Datos mock/locales';
    const enrollmentStats = useMemo(() => mapSummaryStatusBreakdown(summary?.statusBreakdown) ?? getEnrollmentStatusBreakdown(members, summary?.totalMembers), [members, summary?.statusBreakdown, summary?.totalMembers]);
    const debtorRecords = useMemo(() => {
        if (members.length > 0)
            return members;
        return debtors;
    }, [debtors, members]);
    const debtorBreakdown = useMemo(() => buildDebtorActivityBreakdown(debtorRecords), [debtorRecords]);
    const mainDebtorBreakdown = debtorBreakdown.slice(0, 3);
    const remainingDebtorActivities = Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0);
    const totalDebtors = debtorBreakdown.reduce((total, item) => total + item.count, 0);
    const maxDebtorActivityCount = mainDebtorBreakdown[0]?.count ?? 0;
    const activeActivityBreakdown = useMemo(() => buildActiveActivityBreakdown(members), [members]);
    const mainActiveActivityBreakdown = activeActivityBreakdown.slice(0, 6);
    const remainingActiveActivities = Math.max(activeActivityBreakdown.length - mainActiveActivityBreakdown.length, 0);
    const maxActiveActivityCount = mainActiveActivityBreakdown[0]?.count ?? 0;
    const weightedAverageFee = useMemo(() => calculateWeightedAverageFee(members), [members]);
    const weightedAverageFeeLabel = weightedAverageFee === undefined ? '—' : formatArPeso(weightedAverageFee);
    const estimatedDebt = financeSummary?.cuotasAdeudadas ?? summary?.totalEstimatedDebt;
    const syncBadgeLabel = syncLabel;
    const lastSyncLabel = `Última sync: ${formatDateTime(syncStatus?.lastSyncAt)}`;
    const unavailableLabel = financeError ? 'No disponible' : '—';
    const formatFinanceMoney = (value) => financeSummary ? formatArPeso(value) : unavailableLabel;
    const formatPayableObligation = (value) => financeSummary ? `-${formatArPeso(Math.abs(value ?? 0))}` : unavailableLabel;
    const formatUsd = (value) => financeSummary ? `USD ${Math.round(value ?? 0).toLocaleString('es-AR')}` : unavailableLabel;
    const financialSummaryLines = [
        { label: 'Liquidez', value: formatFinanceMoney(financeSummary?.liquidity), highlight: 'positiveCritical', iconBefore: '💰' },
        { label: 'Caja', value: formatFinanceMoney(financeSummary?.cash) },
        { label: 'Banco', value: formatFinanceMoney(financeSummary?.bank) },
        { label: 'Dólares', value: formatUsd(financeSummary?.dollars) }
    ];
    const operationalBalanceLines = [
        { label: 'Cuotas Adeudadas', value: financeSummary || typeof estimatedDebt === 'number' ? formatArPeso(estimatedDebt) : unavailableLabel },
        { label: 'Saldos Pendientes', value: formatFinanceMoney(financeSummary?.pendingNetBalance) },
        { label: 'Saldos a Pagar', value: formatPayableObligation(financeSummary?.saldosAPagar) },
        { label: 'Saldo proyectado', value: formatFinanceMoney(financeSummary?.projectedBalance), highlight: 'positiveCritical', iconBefore: '📈' }
    ];
    const incomeBySectorLines = financeSummary?.incomeBySector.length
        ? financeSummary.incomeBySector.map((item, index) => ({ id: `income-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'positiveCritical' : undefined, iconAfter: index === 0 ? '⭐' : undefined }))
        : [{ id: 'income-unavailable', label: 'Ingresos', value: unavailableLabel }];
    const expenseBySectorLines = financeSummary?.expenseBySector.length
        ? financeSummary.expenseBySector.map((item, index) => ({ id: `expense-${item.name}`, label: item.name, value: formatArPeso(item.amount), highlight: index === 0 ? 'negativeCritical' : undefined, iconAfter: index === 0 ? '🔻' : undefined }))
        : [{ id: 'expense-unavailable', label: 'Egresos', value: unavailableLabel }];
    const formatOptionalNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('es-AR') : '—';
    const formatOptionalMoney = (value) => typeof value === 'number' && Number.isFinite(value) ? formatArPeso(value) : '—';
    const formatOptionalPercent = (value) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 2 }).format(value > 1 ? value / 100 : value) : '—';
    const formatArDate = (value) => {
        if (!value)
            return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            return '—';
        return date.toLocaleDateString('es-AR');
    };
    const formatActivityHighlight = (name, count) => name ? `${name} · ${formatOptionalNumber(count)}` : '—';
    const highlightedLocalIncome = sectorSummary?.local1.highlightedIncome;
    const sectorCards = [
        {
            key: 'fitness',
            title: 'Espacio Fitness',
            moduleId: 'fitness',
            subtitle: 'Membresías y liquidación',
            icon: '🏋️',
            accent: 'fitness',
            mainMetric: { label: 'Rent. total', value: formatOptionalMoney(sectorSummary?.fitness.totalProfitability) },
            secondaryMetrics: [
                { label: 'Total', value: formatOptionalNumber(sectorSummary?.fitness.totalMembers) },
                { label: 'Activos', value: formatOptionalNumber(sectorSummary?.fitness.activeMembers) },
                { label: 'Rent. mes', value: formatOptionalMoney(sectorSummary?.fitness.currentMonthProfitability) },
                { label: 'Adeudados', value: formatOptionalNumber(sectorSummary?.fitness.totalDebtors) },
                { label: 'Deuda', value: formatOptionalMoney(sectorSummary?.fitness.totalDebtAmount) },
                { label: 'Saldo liq.', value: formatOptionalMoney(sectorSummary?.fitness.settlementBalance) }
            ]
        },
        {
            key: 'salon',
            title: 'Salón',
            moduleId: 'salon',
            subtitle: 'Actividades EC',
            icon: '🎭',
            accent: 'salon',
            mainMetric: { label: 'Rent. total', value: formatOptionalMoney(sectorSummary?.salon.totalProfitability) },
            secondaryMetrics: [
                { label: 'Total', value: formatOptionalNumber(sectorSummary?.salon.totalMembers) },
                { label: 'Activos', value: formatOptionalNumber(sectorSummary?.salon.activeMembers) },
                { label: 'Rent. mes', value: formatOptionalMoney(sectorSummary?.salon.currentMonthProfitability) },
                { label: 'Más popular', value: formatActivityHighlight(sectorSummary?.salon.mostPopularActivity?.name, sectorSummary?.salon.mostPopularActivity?.members) }
            ],
            featuredMetric: { label: 'Menos popular', value: formatActivityHighlight(sectorSummary?.salon.leastPopularActivity?.name, sectorSummary?.salon.leastPopularActivity?.members) }
        },
        {
            key: 'aula',
            title: 'Aula',
            moduleId: 'aula',
            subtitle: 'Talleres y comisiones',
            icon: '🎓',
            accent: 'aula',
            mainMetric: { label: 'Rent. total', value: formatOptionalMoney(sectorSummary?.aula.totalProfitability) },
            secondaryMetrics: [
                { label: 'Total', value: formatOptionalNumber(sectorSummary?.aula.totalMembers) },
                { label: 'Activos', value: formatOptionalNumber(sectorSummary?.aula.activeMembers) },
                { label: 'Rent. mes', value: formatOptionalMoney(sectorSummary?.aula.currentMonthProfitability) },
                { label: 'Comisión prom.', value: formatOptionalPercent(sectorSummary?.aula.averageCommission) }
            ]
        },
        {
            key: 'local1',
            title: 'Local 1',
            moduleId: 'local1',
            subtitle: 'Ingresos relevantes',
            icon: '🏪',
            accent: 'local1',
            mainMetric: { label: 'Rent. total', value: formatOptionalMoney(sectorSummary?.local1.totalProfitability) },
            secondaryMetrics: [
                { label: 'Mov. hist.', value: formatOptionalNumber(sectorSummary?.local1.totalRelevantIncomeMovements) },
                { label: 'Últ. 30 días', value: formatOptionalNumber(sectorSummary?.local1.last30DaysRelevantIncomeMovements) },
                { label: 'Rent. mes', value: formatOptionalMoney(sectorSummary?.local1.currentMonthProfitability) }
            ],
            featuredMetric: highlightedLocalIncome
                ? { label: 'Ingreso destacado', value: formatOptionalMoney(highlightedLocalIncome.amount), detail: `${highlightedLocalIncome.concept} · ${formatArDate(highlightedLocalIncome.date)}` }
                : { label: 'Ingreso destacado', value: '—' }
        },
        {
            key: 'cantina',
            title: 'Cantina',
            moduleId: 'cantina',
            subtitle: 'Ventas y CMV',
            icon: '☕',
            accent: 'cantina',
            mainMetric: { label: 'Kiosco', value: formatOptionalMoney(sectorSummary?.cantina.kioskIncome) },
            secondaryMetrics: [
                { label: 'Bebidas', value: formatOptionalMoney(sectorSummary?.cantina.drinksIncome) },
                { label: 'CMV', value: formatOptionalMoney(sectorSummary?.cantina.cmv) }
            ]
        },
        {
            key: 'crm',
            title: 'CRM',
            moduleId: 'crm',
            subtitle: 'Inscriptos y cobranzas',
            icon: '💬',
            accent: 'crm',
            mainMetric: { label: 'Inscriptos', value: formatOptionalNumber(sectorSummary?.crm.totalMembers) },
            secondaryMetrics: [
                { label: 'Activos', value: formatOptionalNumber(sectorSummary?.crm.activeMembers) },
                { label: 'Adeudados', value: formatOptionalNumber(sectorSummary?.crm.totalDebtors) },
                { label: 'Monto adeudado', value: formatOptionalMoney(sectorSummary?.crm.totalDebtAmount) }
            ]
        }
    ];
    return (_jsxs("main", { className: "module-content", children: [_jsxs("section", { className: "module-hero home-hero", children: [_jsxs("div", { className: "home-hero__copy", children: [_jsx("p", { className: "eyebrow", children: "Inicio" }), _jsx("h2", { children: "Panel operativo de miClub" }), _jsx("p", { children: "Resumen ejecutivo e indicadores generales." })] }), _jsxs("div", { className: "home-sync-badges", "aria-label": "Sincronizaci\u00F3n del inicio", children: [_jsx("span", { className: syncStatus?.error ? 'home-sync-badge hero-sync-badge--compact home-sync-badge--warning' : 'home-sync-badge hero-sync-badge--compact', title: syncStatus?.error, children: syncBadgeLabel }), _jsx("span", { className: "home-sync-badge hero-sync-badge--compact home-sync-badge--muted", children: lastSyncLabel }), _jsx("button", { className: "icon-btn home-sync-button", onClick: () => void loadHome(), disabled: loading, children: "Sincronizar" })] })] }), error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), loading && _jsx("p", { className: "section-note", children: "Cargando m\u00E9tricas del club..." }), _jsxs("section", { className: "home-dashboard-stack", "aria-label": "Resumen operativo del club", children: [_jsxs("div", { className: "home-dashboard-row home-dashboard-row--secondary", children: [_jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--summary", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83D\uDCCA Resumen financiero" }), _jsx("p", { children: "Indicadores econ\u00F3micos actuales" })] }), renderFinanceLines(financialSummaryLines), financeError && _jsx("small", { className: "integration-note", children: financeError })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--balance", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83C\uDFE6 Saldos operativos" }), _jsx("p", { children: "Saldos y proyecci\u00F3n operativa" })] }), renderFinanceLines(operationalBalanceLines), financeError && _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n" })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--income", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83D\uDCE5 Ingresos por sector" }), _jsx("p", { children: "Sector \u00B7 monto" })] }), renderFinanceLines(incomeBySectorLines), financeSummary && financeSummary.remainingIncomeSectors > 0 && _jsxs("small", { className: "integration-note integration-note--future", children: ["+ ", financeSummary.remainingIncomeSectors, " sectores"] }), financeError && _jsx("small", { className: "integration-note", children: "No disponible" })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact finance-card finance-card--expense", children: [_jsxs("div", { className: "home-card-heading finance-card__header", children: [_jsx("h4", { children: "\uD83D\uDCE4 Egresos por sector" }), _jsx("p", { children: "Sector \u00B7 monto" })] }), renderFinanceLines(expenseBySectorLines), financeSummary && financeSummary.remainingExpenseSectors > 0 && _jsxs("small", { className: "integration-note integration-note--future", children: ["+ ", financeSummary.remainingExpenseSectors, " sectores"] }), financeError && _jsx("small", { className: "integration-note", children: "No disponible" })] })] }), _jsxs("div", { className: "home-dashboard-row home-dashboard-row--primary", children: [_jsxs("article", { className: "card home-kpi-card home-kpi-card--modern home-kpi-card--enrollment", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83D\uDC65 Inscriptos" }), _jsx("p", { children: "Estados operativos actuales" })] }), _jsxs("div", { className: "enrollment-summary", children: [_jsx("p", { className: "home-kpi-value", children: enrollmentStats.total }), _jsx("span", { children: "Total de inscriptos" })] }), _jsxs("div", { className: "status-breakdown-grid", children: [_jsxs("span", { className: "metric-row metric-row--highlight-green", children: [_jsx("strong", { className: "metric-row__label", children: "Activos" }), _jsx("span", { className: "metric-row__value", children: enrollmentStats.active })] }), _jsxs("span", { className: "metric-row", children: [_jsx("strong", { className: "metric-row__label", children: "Al d\u00EDa" }), _jsx("span", { className: "metric-row__value", children: enrollmentStats.current })] }), _jsxs("span", { className: "metric-row", children: [_jsx("strong", { className: "metric-row__label", children: "Nuevos inscriptos" }), _jsx("span", { className: "metric-row__value", children: enrollmentStats.newEnrollment })] }), _jsxs("span", { className: "metric-row", children: [_jsx("strong", { className: "metric-row__label", children: "Adeudando" }), _jsx("span", { className: "metric-row__value", children: enrollmentStats.debtor })] }), _jsxs("span", { className: "metric-row", children: [_jsx("strong", { className: "metric-row__label", children: "Abandonados" }), _jsx("span", { className: "metric-row__value", children: enrollmentStats.abandoned })] }), _jsxs("span", { className: "metric-row", children: [_jsx("strong", { className: "metric-row__label", children: "Cuota Promedio" }), _jsx("span", { className: "metric-row__value", children: weightedAverageFeeLabel })] })] }), _jsxs("div", { className: "debtor-activity-panel", children: [_jsxs("div", { className: "debtor-activity-panel__heading", children: [_jsx("strong", { children: "Adeudados por actividad" }), _jsxs("span", { children: [totalDebtors, " deudores"] })] }), _jsxs("div", { className: "activity-breakdown-list activity-breakdown-list--compact", children: [renderActivityBreakdown(mainDebtorBreakdown, maxDebtorActivityCount, 'Sin deudores registrados', 'warning'), remainingDebtorActivities > 0 && _jsxs("small", { children: ["+ ", remainingDebtorActivities, " actividades"] })] })] })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--modern home-kpi-card--activity", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83C\uDFF7\uFE0F Inscriptos por actividad" }), _jsx("p", { children: "Solo inscriptos activos" })] }), _jsxs("div", { className: "activity-breakdown-list activity-breakdown-list--featured", children: [renderActivityBreakdown(mainActiveActivityBreakdown, maxActiveActivityCount, 'Sin actividades activas registradas', 'featured'), remainingActiveActivities > 0 && _jsxs("small", { children: ["+ ", remainingActiveActivities, " actividades"] })] })] })] })] }), _jsxs("section", { className: "section-panel", children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("h3", { children: "Distribuci\u00F3n operativa por sector" }), _jsx("p", { children: "Resumen operativo real por sector con datos de gesti\u00F3n general." })] }), _jsx("button", { className: "icon-btn ghost-btn", onClick: () => void loadHome(), children: "Actualizar inicio" })] }), sectorError && _jsx("small", { className: "integration-note", children: sectorError }), _jsx("div", { className: "area-grid", children: sectorCards.map((area) => (_jsxs("article", { className: `area-card area-card--${area.accent}`, children: [_jsx("div", { className: "area-card__topline", "aria-hidden": "true" }), _jsxs("div", { className: "area-card__heading", children: [_jsx("span", { className: "area-card__icon", "aria-hidden": "true", children: area.icon }), _jsxs("div", { className: "area-card__title-block", children: [_jsx("h4", { children: area.title }), _jsx("p", { children: area.subtitle })] }), _jsx("button", { className: "area-card__module-link", onClick: () => onOpenModule(area.moduleId), children: "Ver m\u00F3dulo" })] }), _jsxs("div", { className: "area-card__primary-metric", children: [_jsx("span", { children: area.mainMetric.label }), _jsx("strong", { children: area.mainMetric.value })] }), _jsx("dl", { className: "area-card__metrics", children: area.secondaryMetrics.map((metric) => (_jsxs("div", { className: "area-card__metric", children: [_jsx("dt", { children: metric.label }), _jsx("dd", { children: metric.value })] }, metric.label))) }), area.featuredMetric && (_jsxs("div", { className: "area-card__featured-metric", children: [_jsx("span", { children: area.featuredMetric.label }), _jsx("strong", { children: area.featuredMetric.value }), area.featuredMetric.detail && _jsx("small", { children: area.featuredMetric.detail })] }))] }, area.key))) })] })] }));
}
