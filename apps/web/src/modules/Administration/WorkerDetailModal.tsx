import type { AdministrationSectorDto, AdministrationWorkerDto, AdministrationWorkerMutationDto } from '@miclub/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api';
import { deleteOnboardingPhoto, uploadOnboardingPhoto } from '../../services/api/onboardingApi';
import { getAdministrationSectors } from '../../services/api/administrationApi';
import { ConfigurationEditorModal } from '../shared/ConfigurationEditorModal';
import { validateWorkerPhoto } from '../shared/workerPhotoValidation';

type Props = { worker?: AdministrationWorkerDto; onClose: () => void; onSave?: (input: AdministrationWorkerMutationDto) => Promise<void>; onArchive?: () => Promise<void>; onReload?: () => Promise<void> };
const focusable = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'UTC' });
const showDate = (value?: string | null, includeTime = false) => {
  if (!value) return 'Sin registro';
  const parsed = new Date(includeTime ? value : `${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : (includeTime ? dateTime : date).format(parsed);
};
const statusLabel = (status: string) => ({ active: 'Activo', inactive: 'Inactivo', on_leave: 'De licencia', terminated: 'Finalizado', archived: 'Archivado' }[status] ?? status.replaceAll('_', ' '));

export function WorkerDetailModal({ worker, onClose, onSave, onArchive, onReload }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState<string | null>(null);
  const [hasFixedCompensation, setHasFixedCompensation] = useState(worker?.hasFixedCompensation ?? false);
  const [fixedCompensationAmount,setFixedCompensationAmount]=useState(worker?.fixedCompensationAmount??0);
  const [fixedCompensationFrequency,setFixedCompensationFrequency]=useState<NonNullable<AdministrationWorkerMutationDto['fixedCompensationFrequency']>>(worker?.fixedCompensationFrequency??'MONTHLY');
  const [compensationCurrency,setCompensationCurrency]=useState<NonNullable<AdministrationWorkerMutationDto['currencyCode']>>(worker?.currencyCode??'ARS');
  const [systemAccessEnabled,setSystemAccessEnabled]=useState(worker?.systemAccess ?? true);
  const [photoFileId,setPhotoFileId]=useState<string|null>(null);
  const [photoPreview,setPhotoPreview]=useState<string|null>(null);
  const temporaryPhotoRef=useRef<string|null>(null);
  const previewUrlRef=useRef<string|null>(null);
  const [hasActivePhoto,setHasActivePhoto]=useState(Boolean(worker?.photoFileId));
  const [removePhoto,setRemovePhoto]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [sectors,setSectors]=useState<AdministrationSectorDto[]>([]);
  const [sectorId,setSectorId]=useState(worker?.sectorIds?.[0]??'');

  useEffect(()=>{if(!onSave)return;const controller=new AbortController();void getAdministrationSectors(controller.signal).then(result=>setSectors(result.items)).catch(()=>undefined);return()=>controller.abort();},[onSave]);

  useEffect(()=>()=>{if(temporaryPhotoRef.current)void deleteOnboardingPhoto(temporaryPhotoRef.current).catch(()=>undefined);if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);},[]);

  useEffect(() => {
    if (onSave) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(focusable)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
      if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose, onSave]);

  if (!worker && !onSave) return null;
  const permissions = worker?.permissions ?? [];
  const activities = worker?.activities ?? [];
  const selectPhoto=async(file?:File)=>{if(!file)return;const validationError=validateWorkerPhoto(file);if(validationError){setFormError(validationError);return;}setSaving(true);setFormError(null);try{const uploaded=await uploadOnboardingPhoto(file);const previousPhoto=temporaryPhotoRef.current;if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);const preview=URL.createObjectURL(file);temporaryPhotoRef.current=uploaded.fileId;previewUrlRef.current=preview;setPhotoFileId(uploaded.fileId);setPhotoPreview(preview);if(previousPhoto)void deleteOnboardingPhoto(previousPhoto).catch(()=>undefined);}catch(error){setFormError(error instanceof Error?error.message:'No se pudo subir la foto.');}finally{setSaving(false);}};
  const removeSelectedPhoto=async()=>{const temporary=temporaryPhotoRef.current;if(temporary)await deleteOnboardingPhoto(temporary);temporaryPhotoRef.current=null;if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);previewUrlRef.current=null;setPhotoFileId(null);setPhotoPreview(null);};
  const compensationChanged=!worker||worker.hasFixedCompensation!==hasFixedCompensation||(hasFixedCompensation&&(worker.fixedCompensationAmount!==fixedCompensationAmount||worker.fixedCompensationFrequency!==fixedCompensationFrequency||worker.currencyCode!==compensationCurrency));
  const archive=async()=>{if(!worker||!onArchive||!window.confirm(`¿Archivar a ${worker.displayName}?`))return;setSaving(true);setFormError(null);try{await onArchive();onClose();}catch(error){setFormError(error instanceof Error?error.message:'No se pudo archivar.');}finally{setSaving(false);}};
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!onSave) return; const data=new FormData(event.currentTarget); const field=(key:string)=>{const value=data.get(key);return typeof value==='string'?value:'';};const effectiveFrom=field('compensationEffectiveFrom');if(compensationChanged&&!effectiveFrom){setFormError('Indicá desde cuándo rige el cambio de remuneración.');return;}const amount=hasFixedCompensation?fixedCompensationAmount:null;const frequency=hasFixedCompensation?fixedCompensationFrequency:null;const currency=hasFixedCompensation?compensationCurrency:null; setSaving(true); setFormError(null);setConflict(false); try { await onSave({version:worker?.version,firstName:field('firstName'),lastName:field('lastName'),dni:field('dni'),phone:field('phone')||null,contactEmail:field('contactEmail')||null,accessEmail:systemAccessEnabled?field('accessEmail'):null,password:systemAccessEnabled?field('password')||undefined:undefined,systemAccessEnabled,role:field('role') as AdministrationWorkerMutationDto['role'],sectorId:sectorId||null,hasFixedCompensation,fixedCompensationAmount:amount,fixedCompensationFrequency:frequency,currencyCode:currency,employmentStartDate:field('employmentStartDate')||null,compensationEffectiveFrom:compensationChanged?effectiveFrom:null,photoFileId,removePhoto,notes:field('notes')||null}); temporaryPhotoRef.current=null; if(previewUrlRef.current){URL.revokeObjectURL(previewUrlRef.current);previewUrlRef.current=null;} onClose(); } catch(error){const stale=error instanceof ApiError&&error.code==='OPTIMISTIC_CONCURRENCY_CONFLICT';setConflict(stale);setFormError(stale?'El trabajador cambió en otra sesión. Recargá la ficha antes de volver a guardar.':error instanceof Error?error.message:'No se pudo guardar.');} finally{setSaving(false);} };
  const name=worker?.displayName ?? 'Nuevo trabajador';
  if (onSave) return <ConfigurationEditorModal
    title={worker ? 'Editar trabajador o instructor' : 'Agregar Nuevo Trabajador/Instructor'}
    eyebrow="Equipo del club"
    description="Configurá identidad, acceso, rol y remuneración desde el mismo flujo visual del Onboarding."
    busy={saving}
    onClose={onClose}
    footer={<>{worker&&onArchive&&<button type="button" className="danger-btn" onClick={()=>void archive()} disabled={saving||!worker.roleGuard?.canRemoveDirectorRole}>Archivar trabajador</button>}<button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-btn" type="submit" form="administration-worker-form" disabled={saving}>{saving?'Guardando…':'Guardar'}</button></>}
  >
    <form id="administration-worker-form" onSubmit={event => { void submit(event); }} className="draft-form">
      <section className="draft-photo" aria-labelledby="administration-worker-photo-title"><div className="draft-photo__avatar">{photoPreview?<img src={photoPreview} alt="Foto seleccionada del trabajador"/>:<span aria-hidden="true">{(worker?.firstName?.[0]??'?')+(worker?.lastName?.[0]??'')}</span>}</div><div className="draft-photo__content"><strong id="administration-worker-photo-title">Foto de perfil</strong><div className="draft-photo__actions"><label className="draft-photo__select">{saving?'Procesando…':'Seleccionar foto'}<input className="draft-photo__input" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={event=>void selectPhoto(event.target.files?.[0])}/></label>{photoFileId&&<button type="button" className="draft-photo__remove" disabled={saving} onClick={()=>void removeSelectedPhoto().catch(error=>setFormError(error instanceof Error?error.message:'No se pudo eliminar la foto seleccionada.'))}>Eliminar</button>}{worker&&hasActivePhoto&&!photoFileId&&!removePhoto&&<button type="button" className="draft-photo__remove" disabled={saving} onClick={()=>{setRemovePhoto(true);setHasActivePhoto(false);}}>Eliminar al guardar</button>}{removePhoto&&<button type="button" className="ghost-btn" disabled={saving} onClick={()=>{setRemovePhoto(false);setHasActivePhoto(true);}}>Conservar foto actual</button>}</div></div></section>
      <div className="draft-form__grid"><label>Nombre<input name="firstName" required defaultValue={worker?.firstName??''}/></label><label>Apellido<input name="lastName" required defaultValue={worker?.lastName??''}/></label><label>DNI<input name="dni" required inputMode="numeric" pattern="[0-9]{7,9}" defaultValue={worker?.dni??''}/></label><label>Teléfono<input name="phone" type="tel" defaultValue={worker?.phone??''}/></label><label>Correo de contacto<input name="contactEmail" type="email" defaultValue={worker?.contactEmail??worker?.email??''}/></label><label>Rol<select name="role" defaultValue={(worker?.role as string)??'TRABAJADOR'}><option value="TRABAJADOR">Trabajador</option><option value="INSTRUCTOR">Instructor</option><option value="DIRECTOR">Director</option></select></label><label>Sector<select value={sectorId} onChange={event=>setSectorId(event.target.value)}><option value="">Sin asignar</option>{sectors.filter(sector=>sector.status==='active').map(sector=><option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label></div>
      <fieldset><legend>Acceso al sistema</legend><label className="worker-compensation-toggle"><input type="checkbox" checked={systemAccessEnabled} onChange={event=>setSystemAccessEnabled(event.target.checked)}/><span>Dar acceso al sistema</span></label>{systemAccessEnabled&&<div className="draft-form__grid"><label>Correo de acceso<input name="accessEmail" required type="email" readOnly={Boolean(worker?.accountEmail)} defaultValue={worker?.accountEmail??''}/>{worker?.accountEmail&&<small>La identidad global sólo puede cambiarla el titular de la cuenta.</small>}</label>{!worker&&<label>Contraseña<input name="password" required type="password" minLength={10} autoComplete="new-password"/></label>}</div>}</fieldset>
      <fieldset><legend>Remuneración</legend><label className="worker-compensation-toggle"><input type="checkbox" checked={hasFixedCompensation} onChange={event=>setHasFixedCompensation(event.target.checked)}/><span>Tiene remuneración fija</span></label>{worker?.fixedCompensationEffectiveFrom&&<p role="note">Vigencia actual desde {showDate(worker.fixedCompensationEffectiveFrom)}. Sólo se crea una nueva versión si cambian las condiciones.</p>}{hasFixedCompensation&&<div className="draft-form__grid"><label>Monto<input name="fixedCompensationAmount" required type="number" min="0" step="0.01" value={fixedCompensationAmount} onChange={event=>setFixedCompensationAmount(Number(event.target.value))}/></label><label>Moneda<select name="currencyCode" required value={compensationCurrency} onChange={event=>setCompensationCurrency(event.target.value as typeof compensationCurrency)}><option>ARS</option><option>USD</option><option>BRL</option><option>EUR</option></select></label><label>Frecuencia<select name="fixedCompensationFrequency" required value={fixedCompensationFrequency} onChange={event=>setFixedCompensationFrequency(event.target.value as typeof fixedCompensationFrequency)}><option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></div>}{compensationChanged&&<label>{worker?'Nueva vigencia desde':'Vigente desde'}<input name="compensationEffectiveFrom" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label>}</fieldset>
      <fieldset><legend>Configuración avanzada</legend><div className="draft-form__grid"><label>Fecha de ingreso<input name="employmentStartDate" type="date" defaultValue={worker?.employmentStartDate??''}/></label><label>Notas<textarea name="notes" defaultValue={worker?.notes??''}/></label></div></fieldset>
      {formError&&<p className="activity-form__error" role="alert">{formError}{conflict&&onReload&&<> <button type="button" className="ghost-btn" onClick={()=>void onReload()}>Recargar ficha</button></>}</p>}
    </form>
  </ConfigurationEditorModal>;
  return <div className="sector-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sector-modal worker-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
      <header className="sector-modal__header"><div><p className="eyebrow">Ficha del trabajador</p><h2 id={titleId}>{name}</h2><p id={descriptionId}>{onSave?'Alta o edición laboral y de acceso.':'Información personal, laboral y de acceso de solo lectura.'}</p></div><button className="sector-modal__close" type="button" onClick={onClose} aria-label={`Cerrar ficha de ${name}`}>×</button></header>
      {worker && !onSave && <>
      {worker.roleGuard?.isDirector && !worker.roleGuard.canRemoveDirectorRole && <div className="worker-modal__guard" role="note"><strong>Rol protegido</strong><span>{worker.roleGuard.reason} Una futura edición deberá validar esta condición antes de quitar o desactivar el rol.</span></div>}
      <section><h3>Datos personales y contacto</h3><dl className="sector-modal__facts"><div><dt>Nombre</dt><dd>{worker.displayName}</dd></div><div><dt>DNI</dt><dd>{worker.dni || 'No informado'}</dd></div><div><dt>Teléfono</dt><dd>{worker.phone || 'No informado'}</dd></div><div><dt>Correo de contacto</dt><dd>{worker.contactEmail || worker.email || 'No informado'}</dd></div><div><dt>Correo de acceso</dt><dd>{worker.accountEmail || 'Sin cuenta vinculada'}</dd></div></dl></section>
      <section><h3>Relación laboral</h3><dl className="sector-modal__facts"><div><dt>Rol</dt><dd>{worker.role || 'Sin asignar'}</dd></div><div><dt>Sector</dt><dd>{worker.sector || 'Sin asignar'}</dd></div><div><dt>Remuneración fija</dt><dd>{worker.hasFixedCompensation ? `${money.format(worker.fixedCompensationAmount ?? 0)} · ${worker.fixedCompensationFrequency}` : 'Sin remuneración fija'}</dd></div><div><dt>Estado</dt><dd><span className="worker-list__badge" data-active={worker.isActive}>{statusLabel(worker.status)}</span></dd></div><div><dt>Fecha de ingreso</dt><dd>{showDate(worker.employmentStartDate)}</dd></div><div><dt>Fecha de egreso</dt><dd>{showDate(worker.employmentEndDate)}</dd></div><div className="sector-modal__fact--wide"><dt>Notas</dt><dd>{worker.notes || 'Sin notas'}</dd></div></dl></section>
      <section><h3>Acceso y permisos <span>{permissions.length}</span></h3><p><span className="worker-list__badge" data-active={worker.systemAccess}>{worker.systemAccess ? 'Acceso habilitado' : 'Sin acceso al sistema'}</span></p>{permissions.length ? <ul className="worker-modal__chips">{permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul> : <p>Sin permisos adicionales.</p>}</section>
      <section><h3>Actividades asociadas <span>{activities.length}</span></h3>{activities.length ? <ul className="sector-modal__items">{activities.map((activity) => <li key={activity.id}><strong>{activity.name}</strong><span>{statusLabel(activity.status)}</span></li>)}</ul> : <p>No hay actividades asociadas.</p>}</section>
      <section><h3>Auditoría</h3><dl className="sector-modal__facts activity-modal__audit"><div><dt>Creado</dt><dd>{showDate(worker.createdAt, true)}</dd></div><div><dt>Última actualización</dt><dd>{showDate(worker.updatedAt, true)}</dd></div><div><dt>Identificador</dt><dd><code>{worker.id}</code></dd></div></dl></section>
      <p className="activity-modal__notice" role="note">Esta ficha es de solo lectura. No modifica permisos, salario ni relación laboral.</p></>}
    </div>
  </div>;
}
