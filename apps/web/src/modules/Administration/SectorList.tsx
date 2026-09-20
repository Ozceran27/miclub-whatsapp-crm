import { PERMISSIONS, type AdministrationSectorDto, type AdministrationSectorsResponse } from '@miclub/shared';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createAdministrationSector, getAdministrationSectors, getSectorTemplates, type SectorTemplate } from '../../services/api/administrationApi';
import { SectorDetailModal } from './SectorDetailModal';
import { getSectorVisualMeta } from '../sectorVisualMeta';
import { useSession } from '../../session';
import { useModalAccessibility } from './useModalAccessibility';

const integer = new Intl.NumberFormat('es-AR');
const formText = (form: FormData, name: string) => { const value=form.get(name); return typeof value==='string' ? value.trim() : ''; };

const statusLabel = (sector: AdministrationSectorDto) => {
  const status = sector.status?.trim();
  if (!status) return 'Sin estado';
  return status.charAt(0).toUpperCase() + status.slice(1).toLocaleLowerCase('es-AR').replaceAll('_', ' ');
};

const capacityType = ({ capacityMode }: AdministrationSectorDto) => capacityMode === 'INCOME' ? 'Ingresos' : capacityMode === 'ENROLLMENTS' ? 'Espacio Disponible' : 'Sin configurar';

const schedule = ({ openingTime, closingTime }: AdministrationSectorDto) =>
  openingTime && closingTime ? `${openingTime.slice(0, 5)}–${closingTime.slice(0, 5)}` : 'Sin horario';

const usedCapacity = ({ capacityDataStatus, currentUsage, maximumCapacity, utilizationPercentage }: AdministrationSectorDto) =>
  capacityDataStatus !== 'AVAILABLE' || maximumCapacity == null || utilizationPercentage == null
    ? 'Sin datos'
    : `${integer.format(currentUsage ?? 0)} / ${integer.format(maximumCapacity)} · ${integer.format(utilizationPercentage)}%`;

export function SectorList() {
  const { permissions } = useSession();
  const canCreate = permissions.includes(PERMISSIONS.SECTORS_CREATE);
  const canEdit = permissions.includes(PERMISSIONS.SECTORS_EDIT);
  const canArchive = permissions.includes(PERMISSIONS.SECTORS_ARCHIVE);
  const [response, setResponse] = useState<AdministrationSectorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<SectorTemplate[]>([]);
  const [newColor, setNewColor] = useState('#2563EB');
  const [creationSource, setCreationSource] = useState<'template'|'custom'>('template');
  const creationDialogRef=useRef<HTMLDivElement>(null);
  useModalAccessibility(creationDialogRef,creating,()=>setCreating(false));

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

  useEffect(() => { if (creating && templates.length === 0) void getSectorTemplates().then(({items}) => setTemplates(items)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.')); }, [creating, templates.length]);
  useEffect(() => {
    const openCreation = () => { if (canCreate) setCreating(true); };
    window.addEventListener('miclub:create-sector', openCreation);
    return () => window.removeEventListener('miclub:create-sector', openCreation);
  }, [canCreate]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError(null);
    const templateId = formText(data,'templateId'); const color = formText(data,'color'); const status = formText(data,'status');
    if (!color || !status) { setError('Datos de sector inválidos.'); setLoading(false); return; }
    try {
      if(creationSource==='template') await createAdministrationSector({source:'template',templateId,color,status:status as 'active'|'inactive'|'under_repair'});
      else { const capacityMode=formText(data,'capacityMode')==='ENROLLMENTS'?'ENROLLMENTS':'INCOME'; await createAdministrationSector({source:'custom',name:formText(data,'name'),description:formText(data,'description')||null,iconKey:formText(data,'iconKey')||'category',color,status:status as 'active'|'inactive'|'under_repair',capacityMode,configuredCapacity:capacityMode==='ENROLLMENTS'?Number(formText(data,'configuredCapacity')):null}); }
      setCreating(false); await load(); window.dispatchEvent(new Event('miclub:navigation-changed'));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el sector.'); setLoading(false); }
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
        <div className="sector-list__actions">{canCreate && <button className="icon-btn" type="button" onClick={() => setCreating(true)}>+ Nuevo sector</button>}<button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar sectores'}</button></div>
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
              <span className="sector-list__identity">
                <span role="img" aria-label={`Icono de ${sector.name}`}>{getSectorVisualMeta(sector).icon}</span>
                <span className="sector-list__color" style={{ backgroundColor: sector.color || '#91a4c8' }} aria-label={`Color ${sector.color || 'no configurado'}`} />
                <span><strong>{sector.name}</strong><small>{sector.code}</small></span>
              </span>
              <span className="sector-list__status" data-active={sector.status === 'active'}>{statusLabel(sector)}</span>
              <span className="sector-list__datum"><small>Responsable</small><strong>{sector.managerName || 'Sin asignar'}</strong></span>
              <span className="sector-list__datum"><small>Horario</small><strong>{schedule(sector)}</strong></span>
              <span className="sector-list__datum"><small>Tipo de capacidad</small><strong>{capacityType(sector)}</strong></span>
              <span className="sector-list__datum"><small>Capacidad utilizada</small><strong>{usedCapacity(sector)}</strong></span>
              <span className="sector-list__datum"><small>Actividades</small><strong>{integer.format(sector.activitiesCount ?? 0)}</strong></span>
              <span className="sector-list__datum"><small>Inscriptos activos</small><strong>{integer.format(sector.activeEnrollmentsCount ?? 0)}</strong></span>
              {sector.isSystem && <span className="sector-list__system-badge">Sistema</span>}
              <span className="sector-list__arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {selectedSector && <SectorDetailModal sector={selectedSector} canEdit={canEdit} canArchive={canArchive} onClose={() => setSelectedSectorId(null)} onChanged={async()=>{setSelectedSectorId(null);await load();window.dispatchEvent(new Event('miclub:navigation-changed'));}} />}
      {canCreate && <div ref={creationDialogRef}>
      {creating && <div className="sector-modal__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}><form className="sector-modal sector-create" onSubmit={(e) => void create(e)}><header className="sector-modal__header"><div><p className="eyebrow">Configuración del club</p><h2>Nuevo sector</h2><p>Usá una plantilla o definí un sector personalizado.</p></div><button className="sector-modal__close" type="button" onClick={() => setCreating(false)}>×</button></header><fieldset><legend>Origen</legend><label><input type="radio" checked={creationSource==='template'} onChange={()=>setCreationSource('template')}/> Plantilla</label><label><input type="radio" checked={creationSource==='custom'} onChange={()=>setCreationSource('custom')}/> Personalizado</label></fieldset>{creationSource==='template'?<label>Plantilla<select name="templateId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{templates.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select></label>:<><label>Nombre<input name="name" required/></label><label>Descripción<textarea name="description" rows={2}/></label><label>Icono<input name="iconKey" defaultValue="category" required/></label><label>Capacidad<select name="capacityMode" defaultValue="INCOME"><option value="INCOME">Por ingresos</option><option value="ENROLLMENTS">Por inscripciones</option></select></label><label>Cupo configurado<input name="configuredCapacity" type="number" min="1"/></label></>}<label>Color<input name="color" type="color" value={newColor} onChange={e => setNewColor(e.target.value.toUpperCase())} /></label><fieldset><legend>Paleta rápida</legend>{['#2563EB','#16A34A','#DC2626','#9333EA','#EA580C','#0891B2'].map(color => <button key={color} type="button" className="sector-create__swatch" data-selected={newColor === color} style={{backgroundColor:color}} onClick={() => setNewColor(color)} aria-label={`Usar color ${color}`} />)}</fieldset><label>Estado<select name="status" defaultValue="active"><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="under_repair">En reparación</option></select></label><div className="sector-list__actions"><button type="button" className="ghost-btn" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" className="icon-btn" disabled={loading}>Crear sector</button></div></form></div>}
      </div>}
    </section>
  );
}
