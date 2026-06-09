import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
const AREA_CARDS = [
    { title: 'Espacio Fitness', moduleId: 'fitness', sheetKeys: ['FITNESS', 'Espacio Fitness'], description: 'Inscriptos, cuotas, pagos y actividades.' },
    { title: 'Salón', moduleId: 'salon', sheetKeys: ['SALON', 'SALÓN', 'Salon'], description: 'Actividades, inscriptos y eventos futuros.' },
    { title: 'Aula', moduleId: 'aula', sheetKeys: ['AULA'], description: 'Talleres, cursos e ingresos asociados.' },
    { title: 'Local 1', moduleId: 'local1', sheetKeys: ['LOCAL_1', 'LOCAL 1', 'Local 1'], description: 'Movimientos, comisiones y saldos.' },
    { title: 'Cantina', moduleId: 'cantina', sheetKeys: ['CANTINA'], description: 'Ventas, liquidación y movimientos.' },
    { title: 'CRM', moduleId: 'crm', sheetKeys: ['FITNESS', 'SALON', 'AULA', 'LOCAL_1', 'CANTINA', 'ADMINISTRACION'], description: 'Cobranzas y contacto manual por WhatsApp.' }
];
const normalizeText = (value) => (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const findSheetValue = (source, keys) => {
    if (!source)
        return undefined;
    for (const key of keys) {
        if (source[key] !== undefined)
            return source[key];
    }
    const normalizedEntries = Object.entries(source).map(([key, value]) => [normalizeText(key).replace(/[ _-]/g, ''), value]);
    for (const key of keys) {
        const normalizedKey = normalizeText(key).replace(/[ _-]/g, '');
        const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
        if (match)
            return match[1];
    }
    return undefined;
};
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
const renderActivityBreakdown = (items, maxCount, emptyLabel) => (items.length > 0 ? items.map((item) => (_jsxs("div", { className: "activity-breakdown-item", children: [_jsxs("div", { className: "activity-breakdown-row", children: [_jsx("span", { children: item.activity }), _jsx("strong", { children: item.count })] }), _jsx("div", { className: "activity-breakdown-track", "aria-hidden": "true", children: _jsx("span", { style: { width: `${Math.max((item.count / maxCount) * 100, 8)}%` } }) })] }, item.activity))) : _jsx("p", { className: "empty-card-note", children: emptyLabel }));
const renderFinanceLines = (lines) => (_jsx("div", { className: "finance-lines finance-lines--compact", children: lines.map((line) => (_jsxs("span", { children: [_jsx("strong", { children: line.label }), line.value] }, line.id ?? line.label))) }));
export default function HomeModule({ onOpenModule }) {
    const [summary, setSummary] = useState(null);
    const [members, setMembers] = useState([]);
    const [debtors, setDebtors] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const loadHome = async () => {
        setLoading(true);
        setError(null);
        try {
            const [summaryRes, membersRes, debtorsRes, syncRes] = await Promise.all([
                fetch(`${API}/summary`),
                fetch(`${API}/members`),
                fetch(`${API}/debtors`),
                fetch(`${API}/sync-status`)
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
    const areaCards = useMemo(() => AREA_CARDS.map((area) => ({
        ...area,
        membersCount: area.moduleId === 'crm'
            ? (summary?.totalMembers ?? members.length)
            : findSheetValue(summary?.totalBySheet, area.sheetKeys),
        debtorsCount: area.moduleId === 'crm'
            ? (summary?.totalDebtors ?? debtors.length)
            : findSheetValue(summary?.debtorsBySheet, area.sheetKeys)
    })), [summary, members.length, debtors.length]);
    const estimatedDebt = summary?.totalEstimatedDebt;
    const hasEstimatedDebt = typeof estimatedDebt === 'number' && estimatedDebt > 0;
    const syncBadgeLabel = syncLabel;
    const lastSyncLabel = `Última sync: ${formatDateTime(syncStatus?.lastSyncAt)}`;
    const financialSummaryLines = [
        { label: 'Liquidez', value: '—' },
        { label: 'Caja', value: '—' },
        { label: 'Banco', value: '—' },
        { label: 'Dólares', value: '—' }
    ];
    const operationalBalanceLines = [
        { label: 'Cuotas Adeudadas', value: hasEstimatedDebt ? formatArPeso(estimatedDebt) : '—' },
        { label: 'Saldos Pendientes', value: '—' },
        { label: 'Saldos a Pagar', value: '—' },
        { label: 'Saldo proyectado', value: '—' }
    ];
    const sectorPlaceholderLines = Array.from({ length: 4 }, (_, index) => ({
        id: `sector-placeholder-${index + 1}`,
        label: 'Sector',
        value: '—'
    }));
    return (_jsxs("main", { className: "module-content", children: [_jsxs("section", { className: "module-hero home-hero", children: [_jsxs("div", { className: "home-hero__copy", children: [_jsx("p", { className: "eyebrow", children: "Inicio" }), _jsx("h2", { children: "Panel operativo de miClub" }), _jsx("p", { children: "Resumen ejecutivo e indicadores generales." })] }), _jsxs("div", { className: "home-sync-badges", "aria-label": "Sincronizaci\u00F3n del inicio", children: [_jsx("span", { className: syncStatus?.error ? 'home-sync-badge home-sync-badge--warning' : 'home-sync-badge', title: syncStatus?.error, children: syncBadgeLabel }), _jsx("span", { className: "home-sync-badge home-sync-badge--muted", children: lastSyncLabel }), _jsx("button", { className: "icon-btn home-sync-button", onClick: () => void loadHome(), disabled: loading, children: "Sincronizar" })] })] }), error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), loading && _jsx("p", { className: "section-note", children: "Cargando m\u00E9tricas del club..." }), _jsxs("section", { className: "home-dashboard-stack", "aria-label": "Resumen operativo del club", children: [_jsxs("div", { className: "home-dashboard-row home-dashboard-row--primary", children: [_jsxs("article", { className: "card home-kpi-card home-kpi-card--enrollment", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83D\uDC65 Inscriptos" }), _jsx("p", { children: "Estados operativos actuales" })] }), _jsxs("div", { className: "enrollment-summary", children: [_jsx("p", { className: "home-kpi-value", children: enrollmentStats.total }), _jsx("span", { children: "Total de inscriptos" })] }), _jsxs("div", { className: "status-breakdown-grid", children: [_jsxs("span", { children: [_jsx("strong", { children: "Activos" }), enrollmentStats.active] }), _jsxs("span", { children: [_jsx("strong", { children: "Al d\u00EDa" }), enrollmentStats.current] }), _jsxs("span", { children: [_jsx("strong", { children: "Nuevos inscriptos" }), enrollmentStats.newEnrollment] }), _jsxs("span", { children: [_jsx("strong", { children: "Adeudando" }), enrollmentStats.debtor] }), _jsxs("span", { children: [_jsx("strong", { children: "Abandonados" }), enrollmentStats.abandoned] })] }), _jsxs("div", { className: "debtor-activity-panel", children: [_jsxs("div", { className: "debtor-activity-panel__heading", children: [_jsx("strong", { children: "Adeudados por actividad" }), _jsxs("span", { children: [totalDebtors, " deudores"] })] }), _jsxs("div", { className: "activity-breakdown-list activity-breakdown-list--compact", children: [renderActivityBreakdown(mainDebtorBreakdown, maxDebtorActivityCount, 'Sin deudores registrados'), remainingDebtorActivities > 0 && _jsxs("small", { children: ["+ ", remainingDebtorActivities, " actividades"] })] })] })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83C\uDFF7\uFE0F Inscriptos por actividad" }), _jsx("p", { children: "Solo inscriptos activos" })] }), _jsxs("div", { className: "activity-breakdown-list activity-breakdown-list--featured", children: [renderActivityBreakdown(mainActiveActivityBreakdown, maxActiveActivityCount, 'Sin actividades activas registradas'), remainingActiveActivities > 0 && _jsxs("small", { children: ["+ ", remainingActiveActivities, " actividades"] })] })] })] }), _jsxs("div", { className: "home-dashboard-row home-dashboard-row--secondary", children: [_jsxs("article", { className: "card home-kpi-card home-kpi-card--compact home-kpi-card--finance", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83D\uDCCA Resumen financiero" }), _jsx("p", { children: "Indicadores econ\u00F3micos futuros" })] }), renderFinanceLines(financialSummaryLines), _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n con ADMINISTRACI\u00D3N." })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact home-kpi-card--finance", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83C\uDFE6 Saldos operativos" }), _jsx("p", { children: "Base preparada para ADMINISTRACI\u00D3N" })] }), renderFinanceLines(operationalBalanceLines), _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n con ADMINISTRACI\u00D3N." })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact home-kpi-card--finance", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83D\uDCE5 Ingresos por sector" }), _jsx("p", { children: "Sector \u00B7 monto" })] }), renderFinanceLines(sectorPlaceholderLines), _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n con ADMINISTRACI\u00D3N." }), _jsx("small", { className: "integration-note integration-note--future", children: "Preparado para listar + sectores." })] }), _jsxs("article", { className: "card home-kpi-card home-kpi-card--compact home-kpi-card--finance", children: [_jsxs("div", { className: "home-card-heading", children: [_jsx("h4", { children: "\uD83D\uDCE4 Egresos por sector" }), _jsx("p", { children: "Sector \u00B7 monto" })] }), renderFinanceLines(sectorPlaceholderLines), _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n con ADMINISTRACI\u00D3N." }), _jsx("small", { className: "integration-note integration-note--future", children: "Preparado para listar + sectores." })] })] })] }), _jsxs("section", { className: "section-panel", children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("h3", { children: "Distribuci\u00F3n operativa por sector" }), _jsx("p", { children: "Inscriptos y deudores detectados desde las hojas disponibles." })] }), _jsx("button", { className: "icon-btn ghost-btn", onClick: () => void loadHome(), children: "Actualizar inicio" })] }), _jsx("div", { className: "area-grid", children: areaCards.map((area) => {
                            const hasData = area.membersCount !== undefined || area.debtorsCount !== undefined;
                            return (_jsxs("article", { className: "area-card", children: [_jsxs("div", { children: [_jsx("h4", { children: area.title }), _jsx("p", { children: area.description })] }), hasData ? (_jsxs("div", { className: "area-card__metrics", children: [_jsxs("span", { children: [_jsx("strong", { children: area.membersCount ?? 0 }), " inscriptos"] }), _jsxs("span", { children: [_jsx("strong", { children: area.debtorsCount ?? 0 }), " deudores"] })] })) : (_jsx("p", { className: "muted", children: "Sin datos disponibles todav\u00EDa" })), _jsx("button", { className: "icon-btn ghost-btn", onClick: () => onOpenModule(area.moduleId), children: "Ver m\u00F3dulo" })] }, area.moduleId));
                        }) })] })] }));
}
