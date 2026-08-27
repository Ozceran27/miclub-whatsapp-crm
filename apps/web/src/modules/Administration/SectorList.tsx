import type { AdministrationSectorDto, AdministrationSectorsResponse } from '@miclub/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { createAdministrationSector, getAdministrationSectors, getSectorTemplates, type SectorTemplate } from '../../services/api/administrationApi';
import { SectorDetailModal } from './SectorDetailModal';
import { getSectorVisualMeta } from '../sectorVisualMeta';

const integer = new Intl.NumberFormat('es-AR');

const statusLabel = (sector: AdministrationSectorDto) => {
  const status = sector.operationalStatus?.trim();
  if (!status) return 'Sin estado';
  return status.charAt(0).toUpperCase() + status.slice(1).toLocaleLowerCase('es-AR').replaceAll('_', ' ');
};

const capacityType = ({ maxCapacity, usesEnrollments }: AdministrationSectorDto) => {
  if (!usesEnrollments) return 'Sin control de cupo';
  return maxCapacity == null ? 'Ilimitada' : 'Cupo máximo';
};

const schedule = ({ openingTime, closingTime }: AdministrationSectorDto) =>
  openingTime && closingTime ? `${openingTime.slice(0, 5)}–${closingTime.slice(0, 5)}` : 'Sin horario';

const usedCapacity = ({ currentOccupancy, activeEnrollmentsCount, maxCapacity }: AdministrationSectorDto) => {
  const used = currentOccupancy ?? activeEnrollmentsCount ?? 0;
  return maxCapacity == null ? integer.format(used) : `${integer.format(used)} / ${integer.format(maxCapacity)}`;
};

export function SectorList() {
  const [response, setResponse] = useState<AdministrationSectorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<SectorTemplate[]>([]);
  const [newColor, setNewColor] = useState('#2563EB');

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
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => { if (creating && templates.length === 0) void getSectorTemplates().then(({items}) => setTemplates(items)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.')); }, [creating, templates.length]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError(null);
    const templateId = data.get('templateId'); const color = data.get('color'); const status = data.get('status');
    if (typeof templateId !== 'string' || typeof color !== 'string' || typeof status !== 'string') { setError('Datos de sector inválidos.'); setLoading(false); return; }
    try { await createAdministrationSector({ templateId, color, status: status as 'active'|'inactive'|'under_repair' }); setCreating(false); await load(); }
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
        <div className="sector-list__actions"><button className="icon-btn" type="button" onClick={() => setCreating(true)}>+ Nuevo sector</button><button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar sectores'}</button></div>
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
              <span className="sector-list__status" data-active={sector.operationalStatus?.toUpperCase() === 'COMPLETADO'}>{statusLabel(sector)}</span>
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
      {selectedSector && <SectorDetailModal sector={selectedSector} onClose={() => setSelectedSectorId(null)} />}
      {creating && <div className="sector-modal__backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}><form className="sector-modal sector-create" onSubmit={(e) => void create(e)}><header className="sector-modal__header"><div><p className="eyebrow">Catálogo global</p><h2>Nuevo sector</h2><p>Elegí una plantilla, color y estado inicial.</p></div><button className="sector-modal__close" type="button" onClick={() => setCreating(false)}>×</button></header><label>Plantilla<select name="templateId" required defaultValue=""><option value="" disabled>Seleccionar…</option>{templates.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select></label><label>Color<input name="color" type="color" value={newColor} onChange={e => setNewColor(e.target.value.toUpperCase())} /></label><fieldset><legend>Paleta rápida</legend>{['#2563EB','#16A34A','#DC2626','#9333EA','#EA580C','#0891B2'].map(color => <button key={color} type="button" className="sector-create__swatch" data-selected={newColor === color} style={{backgroundColor:color}} onClick={() => setNewColor(color)} aria-label={`Usar color ${color}`} />)}</fieldset><label>Estado<select name="status" defaultValue="active"><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="under_repair">En reparación</option></select></label><div className="sector-list__actions"><button type="button" className="ghost-btn" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" className="icon-btn" disabled={loading}>Crear sector</button></div></form></div>}
    </section>
  );
}
