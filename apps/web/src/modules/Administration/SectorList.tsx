import { DEFAULT_SECTOR_ICON_KEY, PERMISSIONS, type AdministrationSectorDto, type AdministrationSectorsResponse } from '@miclub/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { createAdministrationSector, getAdministrationSectors, getSectorManagerCandidates, type SectorManagerCandidate } from '../../services/api/administrationApi';
import { SectorDetailModal } from './SectorDetailModal';
import { getSectorVisualMeta } from '../sectorVisualMeta';
import { useSession } from '../../session';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { SectorConfigurationFields } from './SectorConfigurationFields';

const integer = new Intl.NumberFormat('es-AR');
const formText = (form: FormData, name: string) => { const value=form.get(name); return typeof value==='string' ? value.trim() : ''; };

const statusLabels: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', under_repair: 'En reparación', archived: 'Archivado' };
const statusLabel = ({ status }: AdministrationSectorDto) => statusLabels[status] ?? status?.replaceAll('_', ' ') ?? 'Sin estado';

const usedCapacity = ({ capacityDataStatus, currentUsage, maximumCapacity, utilizationPercentage }: AdministrationSectorDto) =>
  capacityDataStatus !== 'AVAILABLE' || maximumCapacity == null || utilizationPercentage == null
    ? 'Sin datos'
    : `${integer.format(currentUsage ?? 0)} / ${integer.format(maximumCapacity)} · ${integer.format(utilizationPercentage)}%`;

const annualProfitability = ({ annualOperatingProfitability, operatingCurrencyCode }: AdministrationSectorDto) => {
  if (annualOperatingProfitability == null) return 'Sin cotización';
  const currency = operatingCurrencyCode || 'ARS';
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(annualOperatingProfitability ?? 0);
  } catch {
    return `${integer.format(annualOperatingProfitability ?? 0)} ${currency}`;
  }
};

export function SectorList() {
  const { permissions } = useSession();
  const canCreate = permissions.includes(PERMISSIONS.SECTORS_CREATE);
  const canEdit = permissions.includes(PERMISSIONS.SECTORS_EDIT);
  const canArchive = permissions.includes(PERMISSIONS.SECTORS_ARCHIVE);
  const canViewFinancials = permissions.includes(PERMISSIONS.FINANCE_READ);
  const canViewActivities = permissions.includes(PERMISSIONS.ACTIVITIES_VIEW);
  const [response, setResponse] = useState<AdministrationSectorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newColor, setNewColor] = useState('#2563EB');
  const [newIconKey, setNewIconKey] = useState(DEFAULT_SECTOR_ICON_KEY);
  const [capacityMode, setCapacityMode] = useState<'ENROLLMENTS'|'INCOME'>('INCOME');
  const [configuredCapacity, setConfiguredCapacity] = useState<number | null>(null);
  const [managers, setManagers] = useState<SectorManagerCandidate[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState<string | null>(null);
  const openCreation = useCallback(() => { setNewColor('#2563EB'); setNewIconKey(DEFAULT_SECTOR_ICON_KEY); setCapacityMode('INCOME'); setConfiguredCapacity(null); setManagers([]); setManagersLoading(true); setManagersError(null); setCreationError(null); setCreating(true); }, []);

  useEffect(() => {
    if (!creating) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setManagersLoading(true); setManagersError(null);
      void getSectorManagerCandidates(controller.signal).then(result => {
        if (!controller.signal.aborted) setManagers(result.items);
      }).catch(() => {
        if (!controller.signal.aborted) setManagersError('No se pudieron cargar los responsables. Podés crear el sector sin asignarlo.');
      }).finally(() => { if (!controller.signal.aborted) setManagersLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [creating]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await getAdministrationSectors(signal));
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los sectores.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer=window.setTimeout(()=>void load(controller.signal),0);
    return () => {window.clearTimeout(timer);controller.abort();};
  }, [load]);

  useEffect(() => {
    const onCreate = () => { if (canCreate) openCreation(); };
    window.addEventListener('miclub:create-sector', onCreate);
    return () => window.removeEventListener('miclub:create-sector', onCreate);
  }, [canCreate, openCreation]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setCreationError(null);
    const status = formText(data,'status');
    if (!newColor || !status || !newIconKey || (capacityMode === 'ENROLLMENTS' && (!Number.isSafeInteger(configuredCapacity) || Number(configuredCapacity) < 1))) { setCreationError('Revisá los datos del sector antes de continuar.'); setLoading(false); return; }
    try {
      await createAdministrationSector({name:formText(data,'name'),managerPersonId:formText(data,'managerPersonId')||null,description:formText(data,'description')||null,iconKey:newIconKey,color:newColor,status:status as 'active'|'inactive'|'under_repair',capacityMode,configuredCapacity:capacityMode==='ENROLLMENTS'?configuredCapacity:null});
      setCreating(false); await load(); window.dispatchEvent(new Event('miclub:navigation-changed'));
    }
    catch (e) { setCreationError(e instanceof Error ? e.message : 'No se pudo crear el sector.'); setLoading(false); }
  };

  const sectors = response?.items ?? [];
  const selectedSector = sectors.find(({ id }) => id === selectedSectorId);

  return (
    <section className="section-panel sector-list" aria-labelledby="sector-list-title" aria-busy={loading}>
      <div className="section-header sector-list__header">
        <div>
          <p className="eyebrow">Sectores</p>
          <h3 id="sector-list-title">Sectores del club</h3>
          <p>{response ? `${response.total} sectores configurados` : 'Configuración, capacidad y operación actual.'}</p>
        </div>
        <div className="sector-list__actions">{canCreate && <button className="icon-btn" type="button" onClick={openCreation}>+ Nuevo sector</button>}<button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar sectores'}</button></div>
      </div>

      {error && <div className="sector-list__state sector-list__state--error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Reintentar</button></div>}
      {!error && loading && sectors.length === 0 && <p className="sector-list__state" role="status">Cargando sectores reales…</p>}
      {!error && !loading && sectors.length === 0 && <p className="sector-list__state">Todavía no hay sectores configurados.</p>}

      {sectors.length > 0 && (
        <div className="sector-list__grid" aria-label="Listado de sectores">
          {sectors.map((sector) => (
            <button
              className="sector-list__row"
              type="button"
              key={sector.id}
              aria-label={`Seleccionar sector ${sector.name}`}
              aria-pressed={selectedSectorId === sector.id}
              onClick={() => setSelectedSectorId(sector.id)}
            >
               <span className="sector-list__identity" title={sector.name}>
                <span role="img" aria-label={`Icono de ${sector.name}`}>{getSectorVisualMeta(sector).icon}</span>
                <span className="sector-list__color" style={{ backgroundColor: sector.color || '#91a4c8' }} aria-label={`Color ${sector.color || 'no configurado'}`} />
                <strong>{sector.name}</strong>
              </span>
               <span className="sector-list__datum" title={sector.managerName || 'Sin asignar'}><small>Responsable</small><strong>{sector.managerName || 'Sin asignar'}</strong></span>
              <span className="sector-list__datum"><small>Capacidad utilizada</small><strong>{usedCapacity(sector)}</strong></span>
              <span className="sector-list__status" data-status={sector.status}>{statusLabel(sector)}</span>
              <span className="sector-list__datum"><small>Actividades</small><strong>{integer.format(sector.activitiesCount ?? 0)}</strong></span>
              <span className="sector-list__datum"><small>Inscriptos activos</small><strong>{integer.format(sector.activeEnrollmentsCount ?? 0)}</strong></span>
              {canViewFinancials && <span className="sector-list__datum sector-list__profitability"><small>Rentabilidad operativa anual</small><strong data-negative={(sector.annualOperatingProfitability ?? 0) < 0} title={`Acumulado ${sector.annualOperatingProfitabilityYear ?? new Date().getFullYear()} hasta hoy`}>{annualProfitability(sector)}</strong></span>}
              <span className="sector-list__system-badge" data-visible={sector.isSystem || undefined} role={sector.isSystem ? 'img' : undefined} aria-label={sector.isSystem ? 'Sector del sistema' : undefined} title={sector.isSystem ? 'Sector del sistema' : undefined}>{sector.isSystem ? '🔒' : null}</span>
              <span className="sector-list__arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {selectedSector && <SectorDetailModal sector={selectedSector} canEdit={canEdit} canArchive={canArchive} canViewFinancials={canViewFinancials} canViewActivities={canViewActivities} onClose={() => setSelectedSectorId(null)} onChanged={async()=>{setSelectedSectorId(null);await load();window.dispatchEvent(new Event('miclub:navigation-changed'));}} />}
      {canCreate && creating && <ConfigurationEditorModal
        title="Agregar Nuevo Sector"
        eyebrow="Configuración del club"
        description="Definí la identidad visual, capacidad y estado del sector."
        busy={loading}
        onClose={() => setCreating(false)}
        footer={<><button type="button" className="ghost-btn" onClick={() => setCreating(false)} disabled={loading}>Cancelar</button><button type="submit" className="primary-btn" form="administration-sector-create" disabled={loading}>{loading ? 'Creando…' : 'Crear sector'}</button></>}
      >
        <form id="administration-sector-create" className="draft-form sector-editor__form" onSubmit={(event) => void create(event)}>
          {creationError && <p className="activity-form__error" role="alert">{creationError}</p>}
          <SectorConfigurationFields managers={managers} managersLoading={managersLoading} managersError={managersError} iconKey={newIconKey} color={newColor} capacityMode={capacityMode} configuredCapacity={configuredCapacity} onIconChange={setNewIconKey} onColorChange={setNewColor} onCapacityModeChange={mode=>{setCapacityMode(mode);setConfiguredCapacity(mode==='INCOME'?null:value=>value??1);}} onCapacityChange={setConfiguredCapacity}/>
        </form>
      </ConfigurationEditorModal>}
    </section>
  );
}
