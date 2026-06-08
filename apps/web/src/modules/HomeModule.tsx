import { useEffect, useMemo, useState } from 'react';
import type { ContactedRecentResponse, Member } from '@miclub/shared';
import { formatArPeso } from '../utils';
import type { ModuleId } from './ModuleNav';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type SyncStatus = {
  source: 'mock' | 'google_sheets';
  enabled: boolean;
  sheets: string[];
  lastSyncAt?: string;
  error?: string;
};

type Summary = {
  totalMembers: number;
  totalDebtors: number;
  totalEstimatedDebt: number;
  debtorsWithoutPayments?: number;
  totalBySheet?: Record<string, number>;
  debtorsBySheet?: Record<string, number>;
};

type HomeModuleProps = {
  onOpenModule: (moduleId: ModuleId) => void;
};

const AREA_CARDS: Array<{ title: string; moduleId: ModuleId; sheetKeys: string[]; description: string }> = [
  { title: 'Espacio Fitness', moduleId: 'fitness', sheetKeys: ['FITNESS', 'Espacio Fitness'], description: 'Inscriptos, cuotas, pagos y actividades.' },
  { title: 'Salón', moduleId: 'salon', sheetKeys: ['SALON', 'SALÓN', 'Salon'], description: 'Actividades, inscriptos y eventos futuros.' },
  { title: 'Aula', moduleId: 'aula', sheetKeys: ['AULA'], description: 'Talleres, cursos e ingresos asociados.' },
  { title: 'Local 1', moduleId: 'local1', sheetKeys: ['LOCAL_1', 'LOCAL 1', 'Local 1'], description: 'Movimientos, comisiones y saldos.' },
  { title: 'Cantina', moduleId: 'cantina', sheetKeys: ['CANTINA'], description: 'Ventas, liquidación y movimientos.' },
  { title: 'CRM', moduleId: 'crm', sheetKeys: ['FITNESS', 'SALON', 'AULA', 'LOCAL_1', 'CANTINA', 'ADMINISTRACION'], description: 'Cobranzas y contacto manual por WhatsApp.' }
];

const findSheetValue = (source: Record<string, number> | undefined, keys: string[]) => {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  const normalizedEntries = Object.entries(source).map(([key, value]) => [key.toLowerCase().replace(/[ _-]/g, ''), value] as const);
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[ _-]/g, '');
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) return match[1];
  }
  return undefined;
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Sin sincronización registrada';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};

export default function HomeModule({ onOpenModule }: HomeModuleProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [contactedRecent, setContactedRecent] = useState<ContactedRecentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, membersRes, debtorsRes, syncRes, contactedRes] = await Promise.all([
        fetch(`${API}/summary`),
        fetch(`${API}/members`),
        fetch(`${API}/debtors`),
        fetch(`${API}/sync-status`),
        fetch(`${API}/contacted-recent`)
      ]);

      if (!summaryRes.ok || !membersRes.ok || !debtorsRes.ok || !syncRes.ok || !contactedRes.ok) {
        throw new Error('No se pudo cargar el inicio operativo.');
      }

      const [summaryPayload, membersPayload, debtorsPayload, syncPayload, contactedPayload] = await Promise.all([
        summaryRes.json(),
        membersRes.json(),
        debtorsRes.json(),
        syncRes.json(),
        contactedRes.json()
      ]);

      setSummary(summaryPayload as Summary);
      setMembers(membersPayload as Member[]);
      setDebtors(debtorsPayload as Member[]);
      setSyncStatus(syncPayload as SyncStatus);
      setContactedRecent(contactedPayload as ContactedRecentResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al cargar el inicio.');
    } finally {
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

  const areaCards = useMemo(() => AREA_CARDS.map((area) => ({
    ...area,
    membersCount: area.moduleId === 'crm'
      ? (summary?.totalMembers ?? members.length)
      : findSheetValue(summary?.totalBySheet, area.sheetKeys),
    debtorsCount: area.moduleId === 'crm'
      ? (summary?.totalDebtors ?? debtors.length)
      : findSheetValue(summary?.debtorsBySheet, area.sheetKeys)
  })), [summary, members.length, debtors.length]);

  return (
    <main className="module-content">
      <section className="module-hero home-hero">
        <div>
          <p className="eyebrow">Inicio</p>
          <h2>Panel operativo de miClub</h2>
          <p>Resumen inicial con datos reales disponibles y accesos rápidos a los módulos de gestión.</p>
        </div>
        <button className="icon-btn" onClick={() => onOpenModule('crm')}>Abrir módulo CRM</button>
      </section>

      {error && <p className="error-msg">Error: {error}</p>}
      {loading && <p className="section-note">Cargando métricas del club...</p>}

      <section className="dashboard home-dashboard">
        <article className="card"><h4>👥 Total de inscriptos</h4><p>{summary?.totalMembers ?? members.length}</p></article>
        <article className="card"><h4>💳 Total adeudando</h4><p>{summary?.totalDebtors ?? debtors.length}</p></article>
        <article className="card"><h4>$ Deuda estimada</h4><p>{formatArPeso(summary?.totalEstimatedDebt ?? 0)}</p></article>
        <article className="card"><h4>📩 Contactados últimos 30 días</h4><p>{contactedRecent?.memberIds.length ?? 0}</p></article>
        <article className="card"><h4>🔄 Estado de sincronización</h4><p>{syncLabel}</p></article>
        <article className="card"><h4>🕒 Última sincronización</h4><p>{formatDateTime(syncStatus?.lastSyncAt)}</p></article>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <div>
            <h3>Resumen por área</h3>
            <p>Base inicial para los futuros tableros por hoja/sector.</p>
          </div>
          <button className="icon-btn ghost-btn" onClick={() => void loadHome()}>Actualizar inicio</button>
        </div>
        <div className="area-grid">
          {areaCards.map((area) => {
            const hasData = area.membersCount !== undefined || area.debtorsCount !== undefined;
            return (
              <article key={area.moduleId} className="area-card">
                <div>
                  <h4>{area.title}</h4>
                  <p>{area.description}</p>
                </div>
                {hasData ? (
                  <div className="area-card__metrics">
                    <span><strong>{area.membersCount ?? 0}</strong> inscriptos</span>
                    <span><strong>{area.debtorsCount ?? 0}</strong> deudores</span>
                  </div>
                ) : (
                  <p className="muted">Sin datos disponibles todavía</p>
                )}
                <button className="icon-btn ghost-btn" onClick={() => onOpenModule(area.moduleId)}>Ver módulo</button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
