import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { formatArPeso } from '../utils';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const ACTIVE_STATUSES = new Set(['al dia', 'nuevo inscripto', 'adeudando']);
const ABANDONED_STATUS = 'abandonado';
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
const getMemberStatus = (member) => normalizeText(member.estado);
const isDebtor = (member) => getMemberStatus(member) === 'adeudando';
const getActivityName = (member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';
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
    const enrollmentStats = useMemo(() => {
        const active = members.filter((member) => ACTIVE_STATUSES.has(getMemberStatus(member))).length;
        const abandoned = members.filter((member) => getMemberStatus(member) === ABANDONED_STATUS).length;
        return {
            total: summary?.totalMembers ?? members.length,
            active,
            abandoned
        };
    }, [members, summary?.totalMembers]);
    const debtorRecords = useMemo(() => {
        if (debtors.length > 0)
            return debtors;
        return members.filter(isDebtor);
    }, [debtors, members]);
    const debtorBreakdown = useMemo(() => buildActivityBreakdown(debtorRecords), [debtorRecords]);
    const mainDebtorBreakdown = debtorBreakdown.slice(0, 4);
    const remainingDebtorActivities = Math.max(debtorBreakdown.length - mainDebtorBreakdown.length, 0);
    const activeActivities = useMemo(() => {
        const activities = new Set(members
            .filter((member) => ACTIVE_STATUSES.has(getMemberStatus(member)))
            .map(getActivityName)
            .filter((activity) => activity !== 'Sin actividad asignada'));
        return activities.size;
    }, [members]);
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
    return (_jsxs("main", { className: "module-content", children: [_jsx("section", { className: "module-hero home-hero", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Inicio" }), _jsx("h2", { children: "Panel operativo de miClub" }), _jsx("p", { children: "Resumen ejecutivo con indicadores generales, sincronizaci\u00F3n y datos reales disponibles por sector." })] }) }), error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), loading && _jsx("p", { className: "section-note", children: "Cargando m\u00E9tricas del club..." }), _jsxs("section", { className: "dashboard home-dashboard", children: [_jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83D\uDC65 Total de inscriptos" }), _jsx("p", { children: enrollmentStats.total }), _jsxs("div", { className: "metric-list metric-list--compact", children: [_jsxs("span", { children: [_jsx("strong", { children: "Activos" }), enrollmentStats.active] }), _jsxs("span", { children: [_jsx("strong", { children: "Abandonados" }), enrollmentStats.abandoned] })] })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83D\uDCB3 Adeudando" }), _jsx("p", { children: summary?.totalDebtors ?? debtorRecords.length }), _jsxs("div", { className: "metric-list", children: [mainDebtorBreakdown.length > 0 ? mainDebtorBreakdown.map((item) => (_jsxs("span", { children: [_jsx("strong", { children: item.activity }), item.count] }, item.activity))) : _jsxs("span", { children: [_jsx("strong", { children: "Sin deudores registrados" }), "0"] }), remainingDebtorActivities > 0 && _jsxs("small", { children: ["+ ", remainingDebtorActivities, " actividades"] })] })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83C\uDFE6 Saldos operativos" }), _jsxs("div", { className: "finance-lines", children: [_jsxs("span", { children: [_jsx("strong", { children: "Saldo adeudado" }), hasEstimatedDebt ? formatArPeso(estimatedDebt) : '—'] }), _jsxs("span", { children: [_jsx("strong", { children: "Movimientos pendientes" }), "\u2014"] }), _jsxs("span", { children: [_jsx("strong", { children: "Saldo total" }), "\u2014"] })] }), _jsx("small", { className: "integration-note", children: "Se integrar\u00E1 desde la hoja ADMINISTRACI\u00D3N." })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83D\uDCCA Resumen financiero" }), _jsxs("div", { className: "finance-lines", children: [_jsxs("span", { children: [_jsx("strong", { children: "Caja" }), "\u2014"] }), _jsxs("span", { children: [_jsx("strong", { children: "Bancos" }), "\u2014"] }), _jsxs("span", { children: [_jsx("strong", { children: "Saldo proyectado" }), "\u2014"] }), _jsxs("span", { children: [_jsx("strong", { children: "Pendientes" }), "\u2014"] })] }), _jsx("small", { className: "integration-note", children: "Pendiente de integraci\u00F3n con ADMINISTRACI\u00D3N." })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83D\uDD04 Estado de sincronizaci\u00F3n" }), _jsx("p", { children: syncLabel })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83D\uDD52 \u00DAltima sincronizaci\u00F3n" }), _jsx("p", { children: formatDateTime(syncStatus?.lastSyncAt) })] }), _jsxs("article", { className: "card home-kpi-card", children: [_jsx("h4", { children: "\uD83C\uDFF7\uFE0F Actividades activas detectadas" }), _jsx("p", { children: activeActivities })] })] }), _jsxs("section", { className: "section-panel", children: [_jsxs("div", { className: "section-header", children: [_jsxs("div", { children: [_jsx("h3", { children: "Distribuci\u00F3n operativa por sector" }), _jsx("p", { children: "Inscriptos y deudores detectados desde las hojas disponibles." })] }), _jsx("button", { className: "icon-btn ghost-btn", onClick: () => void loadHome(), children: "Actualizar inicio" })] }), _jsx("div", { className: "area-grid", children: areaCards.map((area) => {
                            const hasData = area.membersCount !== undefined || area.debtorsCount !== undefined;
                            return (_jsxs("article", { className: "area-card", children: [_jsxs("div", { children: [_jsx("h4", { children: area.title }), _jsx("p", { children: area.description })] }), hasData ? (_jsxs("div", { className: "area-card__metrics", children: [_jsxs("span", { children: [_jsx("strong", { children: area.membersCount ?? 0 }), " inscriptos"] }), _jsxs("span", { children: [_jsx("strong", { children: area.debtorsCount ?? 0 }), " deudores"] })] })) : (_jsx("p", { className: "muted", children: "Sin datos disponibles todav\u00EDa" })), _jsx("button", { className: "icon-btn ghost-btn", onClick: () => onOpenModule(area.moduleId), children: "Ver m\u00F3dulo" })] }, area.moduleId));
                        }) })] })] }));
}
