import { DEFAULT_SECTOR_ICON_KEY, type AdministrationActivityDto, type AdministrationSectorDto, type AdministrationWorkerDto } from '@miclub/shared';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { archiveAdministrationSector, changeAdministrationSectorStatus, getAdministrationWorkers, getSectorActivities, updateAdministrationSector } from '../../services/api/administrationApi';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { ConfigurationColorPicker, SectorIconPicker } from '../shared/ConfigurationVisualFields';
import { SectorCapacityFields } from '../shared/SectorCapacityFields';
import { getSectorVisualMeta } from '../sectorVisualMeta';

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
  const [managers, setManagers] = useState<AdministrationWorkerDto[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [iconKey, setIconKey] = useState(sector.iconKey || DEFAULT_SECTOR_ICON_KEY);
  const [color, setColor] = useState(sector.color || '#2563EB');
  const [capacityMode, setCapacityMode] = useState<'ENROLLMENTS' | 'INCOME'>(sector.capacityMode === 'ENROLLMENTS' ? 'ENROLLMENTS' : 'INCOME');
  const [configuredCapacity, setConfiguredCapacity] = useState<number | null>(sector.configuredCapacity ?? null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([getSectorActivities(sector.id, controller.signal), getAdministrationWorkers(controller.signal)])
      .then(([activityResult, workerResult]) => {
        if (controller.signal.aborted) return;
        if (activityResult.status === 'fulfilled') setActivities(activityResult.value.items);
        if (workerResult.status === 'fulfilled') setManagers(workerResult.value.items.filter(worker => worker.isActive && Boolean(worker.personId)));
        if (activityResult.status === 'rejected' || workerResult.status === 'rejected') setError('Parte de la información relacionada no pudo cargarse. La configuración disponible puede editarse igualmente.');
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
        managerPersonId: formText(form, 'managerPersonId') || null,
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
  const currentManagerMissing = sector.managerPersonId && !managers.some(({ personId }) => personId === sector.managerPersonId);

  return <ConfigurationEditorModal
    size="large"
    title={`${canEdit ? 'Editar' : 'Resumen de'} ${sector.name}`}
    eyebrow="Configuración del sector"
    description="Resumen operativo, identidad visual y parámetros de funcionamiento."
    busy={saving}
    onClose={onClose}
    footer={<>{canArchive && !sector.isSystem && <button type="button" className="danger-btn sector-editor__footer-delete" disabled={saving} onClick={() => void archive()}>Eliminar sector</button>}<button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>{canEdit ? 'Cancelar' : 'Cerrar'}</button>{canEdit && <button type="submit" className="primary-btn" form="administration-sector-edit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>}</>}
  >
    <div className="sector-editor__hero">
      <span className="sector-editor__visual" style={{ '--sector-color': color } as CSSProperties}><span aria-hidden="true">{getSectorVisualMeta({ ...sector, iconKey }).icon}</span></span>
      <div><strong>{sector.name}</strong><span>{sector.description || 'Sin descripción'}</span></div>
      <span className="sector-list__status" data-status={sector.status}>{statusLabels[sector.status] ?? sector.status}</span>
      {sector.isSystem && <span className="sector-list__system-badge" role="img" aria-label="Sector del sistema" title="Sector del sistema">🔒</span>}
    </div>

    {sector.isSystem && <div className="sector-modal__restriction" role="note"><strong>Sector del sistema</strong><span>El nombre, el ícono y la eliminación están protegidos. Su color y configuración operativa sí pueden mantenerse.</span></div>}

    <section className="sector-editor__summary" aria-label="Resumen del sector">
      <div><small>Responsable</small><strong>{sector.managerName || 'Sin asignar'}</strong></div>
      <div><small>Capacidad utilizada</small><strong>{capacity}</strong></div>
      <div><small>Capacidad ociosa</small><strong>{idle}</strong></div>
      <div><small>Actividades</small><strong>{number.format(sector.activitiesCount ?? 0)}</strong></div>
      <div><small>Inscriptos activos</small><strong>{number.format(sector.activeEnrollmentsCount ?? 0)}</strong></div>
      <div><small>Rentabilidad operativa {sector.annualOperatingProfitabilityYear ?? ''}</small><strong data-negative={(sector.annualOperatingProfitability ?? 0) < 0}>{profitability}</strong></div>
    </section>

    {canEdit && <form id="administration-sector-edit" className="draft-form sector-editor__form" onSubmit={event => void edit(event)}>
      <fieldset><legend>Identidad del sector</legend><div className="draft-form__grid"><label>Nombre<input name="name" defaultValue={sector.name} disabled={sector.isSystem} required /></label><label>Responsable<select name="managerPersonId" defaultValue={sector.managerPersonId ?? ''}><option value="">Sin asignar</option>{currentManagerMissing && <option value={sector.managerPersonId ?? ''}>{sector.managerName || 'Responsable actual'} (actual)</option>}{managers.map(manager => <option key={manager.id} value={manager.personId ?? ''}>{manager.displayName}</option>)}</select></label></div><label>Descripción<textarea name="description" rows={3} defaultValue={sector.description ?? ''} /></label></fieldset>
      <fieldset><legend>Apariencia</legend>{sector.isSystem ? <div className="sector-editor__locked-icon"><span aria-hidden="true">{getSectorVisualMeta(sector).icon}</span><div><strong>Ícono del sistema</strong><small>Este ícono identifica una función estructural del club.</small></div></div> : <SectorIconPicker value={iconKey} onChange={setIconKey} />}<ConfigurationColorPicker value={color} onChange={setColor} label="Color del sector" /></fieldset>
      <SectorCapacityFields mode={capacityMode} capacity={configuredCapacity} onModeChange={mode=>{setCapacityMode(mode);setConfiguredCapacity(mode==='INCOME'?null:value=>value??1);}} onCapacityChange={setConfiguredCapacity}/>
    </form>}

    {canEdit && <section className="sector-editor__operations"><div><h4>Estado operativo</h4><p>Cambiá la disponibilidad del sector sin alterar su historia.</p></div><div className="sector-editor__status-actions"><button type="button" disabled={saving || sector.status === 'active'} onClick={() => void changeStatus('active')}>Activar</button><button type="button" disabled={saving || sector.status === 'inactive'} onClick={() => void changeStatus('inactive')}>Desactivar</button><button type="button" disabled={saving || sector.status === 'under_repair'} onClick={() => void changeStatus('under_repair')}>En reparación</button></div></section>}

    <section className="sector-editor__related"><div><h4>Actividades vinculadas</h4><span>{loadingRelated ? 'Cargando…' : `${activities.length} activas`}</span></div>{!loadingRelated && (activities.length ? <ul className="sector-modal__items">{activities.slice(0, 6).map(activity => <li key={activity.id}><strong>{activity.name}</strong><span>{activity.status}</span></li>)}</ul> : <p>No hay actividades vigentes asociadas.</p>)}</section>

    {error && <p className="activity-form__error" role="alert">{error}</p>}

  </ConfigurationEditorModal>;
}
