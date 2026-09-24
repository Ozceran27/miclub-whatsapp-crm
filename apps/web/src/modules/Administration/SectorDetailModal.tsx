import { DEFAULT_SECTOR_ICON_KEY, type AdministrationActivityDto, type AdministrationSectorDto } from '@miclub/shared';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { archiveAdministrationSector, changeAdministrationSectorStatus, getSectorManagerCandidates, getSectorActivities, updateAdministrationSector, type SectorManagerCandidate } from '../../services/api/administrationApi';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { getSectorVisualMeta } from '../sectorVisualMeta';
import { activityStatusLabel } from './activityPresentation';
import { SectorConfigurationFields } from './SectorConfigurationFields';

type Props = { sector: AdministrationSectorDto; canEdit: boolean; canArchive: boolean; onClose: () => void; onChanged: () => Promise<void> };
const number = new Intl.NumberFormat('es-AR');
const statusLabels: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', under_repair: 'En reparación', archived: 'Archivado' };
const formText = (form: FormData, name: string) => { const value=form.get(name); return typeof value==='string' ? value.trim() : ''; };

const money = (value: number, currency = 'ARS') => {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${number.format(value)} ${currency}`; }
};

export function SectorDetailModal({ sector, canEdit, canArchive, onClose, onChanged }: Props) {
  const [activities, setActivities] = useState<AdministrationActivityDto[]>([]);
  const [managers, setManagers] = useState<SectorManagerCandidate[]>([]);
  const [managersError, setManagersError] = useState<string | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [iconKey, setIconKey] = useState(sector.iconKey || DEFAULT_SECTOR_ICON_KEY);
  const [color, setColor] = useState(sector.color || '#2563EB');
  const [capacityMode, setCapacityMode] = useState<'ENROLLMENTS' | 'INCOME'>(sector.capacityMode === 'ENROLLMENTS' ? 'ENROLLMENTS' : 'INCOME');
  const [configuredCapacity, setConfiguredCapacity] = useState<number | null>(sector.configuredCapacity ?? null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([getSectorActivities(sector.id, controller.signal), getSectorManagerCandidates(controller.signal)])
      .then(([activityResult, workerResult]) => {
        if (controller.signal.aborted) return;
        if (activityResult.status === 'fulfilled') setActivities(activityResult.value.items);
        if (workerResult.status === 'fulfilled') setManagers(workerResult.value.items);
        if (workerResult.status === 'rejected') setManagersError('No se pudieron cargar los responsables. Reintentá al abrir la ficha nuevamente.');
        if (activityResult.status === 'rejected') setError('Las actividades vinculadas no pudieron cargarse.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingRelated(false); });
    return () => controller.abort();
  }, [sector.id]);

  const edit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (capacityMode === 'ENROLLMENTS' && (!Number.isSafeInteger(configuredCapacity) || Number(configuredCapacity) < 1)) {
      setError('La capacidad máxima debe ser un entero mayor o igual a 1.');
      return;
    }
    setSaving(true); setError(null);
    try {
      await updateAdministrationSector(sector.id, {
        updatedAt: sector.updatedAt,
        name: sector.isSystem ? sector.name : formText(form, 'name'),
        description: formText(form, 'description') || null,
        ...(sector.isSystem ? {} : { iconKey }),
        color,
        managerPersonId: managersError ? sector.managerPersonId ?? null : formText(form, 'managerPersonId') || null,
        capacityMode,
        configuredCapacity: capacityMode === 'ENROLLMENTS' ? configuredCapacity : null,
      });
      await onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo editar el sector.');
      setSaving(false);
    }
  };

  const changeStatus = async (value: 'active' | 'inactive' | 'under_repair') => {
    setSaving(true); setError(null);
    try { await changeAdministrationSectorStatus(sector.id, sector.updatedAt, value); await onChanged(); }
    catch (statusError) { setError(statusError instanceof Error ? statusError.message : 'No se pudo cambiar el estado.'); setSaving(false); }
  };

  const archive = async () => {
    if (!window.confirm(`¿Eliminar el sector “${sector.name}”?\n\nSe archivará y dejará de mostrarse, pero su historia permanecerá conservada.`)) return;
    setSaving(true); setError(null);
    try { await archiveAdministrationSector(sector.id, sector.updatedAt); await onChanged(); }
    catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : 'No se pudo eliminar el sector.'); setSaving(false); }
  };

  const capacity = sector.capacityDataStatus !== 'AVAILABLE' || sector.maximumCapacity == null
    ? 'Sin datos'
    : `${number.format(sector.currentUsage ?? 0)} / ${number.format(sector.maximumCapacity)}`;
  const idle = sector.capacityDataStatus === 'AVAILABLE' && sector.idlePercentage != null ? `${number.format(sector.idlePercentage)}%` : 'Sin datos';
  const profitability = sector.annualOperatingProfitabilityStatus === 'INCOMPLETE_EXCHANGE_RATE' || sector.annualOperatingProfitability == null
    ? 'Sin cotización'
    : money(sector.annualOperatingProfitability, sector.operatingCurrencyCode || 'ARS');
  return <ConfigurationEditorModal
    size="large"
    title={editing ? `Editar ${sector.name}` : sector.name}
    eyebrow="Configuración del sector"
    description={editing ? 'Actualizá la identidad visual y los parámetros del sector.' : 'Resumen operativo, identidad visual y parámetros de funcionamiento.'}
    busy={saving}
    bodyClassName={editing ? 'sector-editor__body sector-editor__body--editing' : 'sector-editor__body'}
    onClose={onClose}
    footer={editing ? <><button type="button" className="ghost-btn" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button><button type="submit" className="primary-btn" form="administration-sector-edit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></> : <>{canArchive && !sector.isSystem && <button type="button" className="danger-btn sector-editor__footer-delete" disabled={saving} onClick={() => void archive()}>Eliminar sector</button>}<button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>Cerrar</button>{canEdit && !sector.isSystem && <button type="button" className="primary-btn" onClick={() => { setError(null); setEditing(true); }}>Editar sector</button>}</>}
  >
    {editing ? <form id="administration-sector-edit" className="draft-form sector-editor__form" onSubmit={event => void edit(event)}>
      <SectorConfigurationFields sector={sector} managers={managers} managersError={managersError} iconKey={iconKey} color={color} capacityMode={capacityMode} configuredCapacity={configuredCapacity} onIconChange={setIconKey} onColorChange={setColor} onCapacityModeChange={mode=>{setCapacityMode(mode);setConfiguredCapacity(mode==='INCOME'?null:value=>value??1);}} onCapacityChange={setConfiguredCapacity}/>
      {error && <p className="activity-form__error" role="alert">{error}</p>}
    </form> : <>
    <div className="sector-editor__hero">
      <span className="sector-editor__visual" style={{ '--sector-color': color } as CSSProperties}><span aria-hidden="true">{getSectorVisualMeta({ ...sector, iconKey }).icon}</span></span>
      <div><strong>{sector.name}</strong><span>{sector.description || 'Sin descripción'}</span></div>
      <span className="sector-list__status" data-status={sector.status}>{statusLabels[sector.status] ?? sector.status}</span>
      {sector.isSystem && <span className="sector-list__system-badge" role="img" aria-label="Sector del sistema" title="Sector del sistema">🔒</span>}
    </div>

    {sector.isSystem && <div className="sector-modal__restriction" role="note"><strong>Sector del sistema</strong><span>La ficha es de consulta. El estado operativo se puede cambiar con los controles de abajo.</span></div>}

    <section className="sector-editor__summary" aria-label="Resumen del sector">
      <div><small>Responsable</small><strong>{sector.managerName || 'Sin asignar'}</strong></div>
      <div><small>Capacidad utilizada</small><strong>{capacity}</strong></div>
      <div><small>Capacidad ociosa</small><strong>{idle}</strong></div>
      <div><small>Actividades</small><strong>{number.format(sector.activitiesCount ?? 0)}</strong></div>
      <div><small>Inscriptos activos</small><strong>{number.format(sector.activeEnrollmentsCount ?? 0)}</strong></div>
      <div><small>Rentabilidad operativa {sector.annualOperatingProfitabilityYear ?? ''}</small><strong data-negative={(sector.annualOperatingProfitability ?? 0) < 0}>{profitability}</strong></div>
    </section>

    {canEdit && <section className="sector-editor__operations"><div><h4>Estado operativo</h4><p>Cambiá la disponibilidad del sector sin alterar su historia.</p></div><div className="sector-editor__status-actions"><button type="button" disabled={saving || sector.status === 'active'} onClick={() => void changeStatus('active')}>Activar</button><button type="button" disabled={saving || sector.status === 'inactive'} onClick={() => void changeStatus('inactive')}>Desactivar</button><button type="button" disabled={saving || sector.status === 'under_repair'} onClick={() => void changeStatus('under_repair')}>En reparación</button></div></section>}

    <section className="sector-editor__related"><div><h4>Actividades vinculadas</h4><span>{loadingRelated ? 'Cargando…' : `${activities.length} vinculadas`}</span></div>{!loadingRelated && (activities.length ? <ul className="sector-modal__items">{activities.slice(0, 6).map(activity => <li key={activity.id}><strong>{activity.name}</strong><span>{activityStatusLabel(activity.status)}</span></li>)}</ul> : <p>No hay actividades asociadas.</p>)}</section>

    {error && <p className="activity-form__error" role="alert">{error}</p>}
    </>}
  </ConfigurationEditorModal>;
}
