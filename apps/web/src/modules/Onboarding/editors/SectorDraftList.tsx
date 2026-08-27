import { DEFAULT_SECTOR_ICON_KEY, getSectorIcon, SECTOR_COLOR_PALETTE, SECTOR_ICON_CATALOG, type OnboardingSectorDraft } from '@miclub/shared';
import { useState, type FormEvent } from 'react';
import { DraftEditorModal } from './DraftEditorModal';

const statusLabel = { active: 'Activo', inactive: 'Inactivo', under_repair: 'En reparación' };
const categoryNames: Record<string,string> = { deportes:'Deportes', administracion:'Administración', tesoreria:'Tesorería', social:'Espacios sociales', salud:'Salud', mantenimiento:'Mantenimiento', marketing:'Marketing', gastronomia:'Gastronomía', servicios:'Servicios' };

export function SectorDraftList({ items, onChange }: { items: OnboardingSectorDraft[]; onChange: (items: OnboardingSectorDraft[]) => void }) {
  const [editing, setEditing] = useState<OnboardingSectorDraft | null>();
  const [iconFilter, setIconFilter] = useState('');
  const visibleIcons = SECTOR_ICON_CATALOG.filter(icon => `${icon.name} ${categoryNames[icon.category]}`.toLocaleLowerCase('es').includes(iconFilter.toLocaleLowerCase('es')));
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const field = (key:string) => { const value=data.get(key); return typeof value === 'string' ? value : ''; }; const name = field('name').trim();
    const current = editing || undefined;
    const value: OnboardingSectorDraft = { clientId: current?.clientId ?? crypto.randomUUID(), iconKey: field('iconKey'), code: current?.code ?? name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-'), name, color: field('color'), status: field('status') as OnboardingSectorDraft['status'], isSystem: false };
    onChange(current ? items.map(item => item.clientId === current.clientId ? value : item) : [...items, value]); setEditing(undefined);
  };
  return <section className="draft-editor"><h3>Sectores del club</h3><div className="draft-card-grid">
    {items.map(item => { const icon = getSectorIcon(item.iconKey); return <article className="draft-card" key={item.clientId}>
      <span className="draft-card__icon" role="img" aria-label={icon.name}>{icon.glyph}</span><div className="draft-card__body"><strong>{item.name}</strong><span><i className="draft-color" style={{ backgroundColor:item.color }}/> {statusLabel[item.status]}</span>{item.isSystem && <small>Elemento del sistema · protegido</small>}</div>
      <div className="draft-card__actions">{item.isSystem ? <span className="draft-lock" title="No se puede modificar">🔒</span> : <><button type="button" className="draft-icon-button" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`}>✎</button><button type="button" className="draft-icon-button draft-icon-button--danger" onClick={() => onChange(items.filter(value => value.clientId !== item.clientId))} aria-label={`Eliminar ${item.name}`}>🗑</button></>}</div>
    </article>; })}
    <button className="draft-add-card" type="button" onClick={() => setEditing(null)}><span aria-hidden="true">＋</span><strong>Agregar Nuevo Sector</strong></button>
  </div>{editing !== undefined && <DraftEditorModal title={editing ? 'Editar sector' : 'Agregar Nuevo Sector'} onClose={() => setEditing(undefined)}><form className="draft-form" onSubmit={save}>
    <label>Nombre<input name="name" required defaultValue={editing?.name}/></label><fieldset><legend>Icono del sector</legend><label className="draft-icon-filter">Filtrar iconos<input type="search" value={iconFilter} onChange={event => setIconFilter(event.target.value)} placeholder="Deporte, salud, servicio…"/></label><div className="draft-sector-icons">{Object.entries(categoryNames).map(([category,label]) => { const icons=visibleIcons.filter(icon=>icon.category===category); return icons.length ? <section key={category} aria-label={label}><strong>{label}</strong><div className="draft-icon-grid">{icons.map(icon=><label key={icon.key} title={icon.name}><input type="radio" name="iconKey" value={icon.key} required defaultChecked={(editing?.iconKey ?? DEFAULT_SECTOR_ICON_KEY)===icon.key}/><span aria-hidden="true">{icon.glyph}</span><span className="sr-only">{icon.name}</span></label>)}</div></section>:null;})}</div></fieldset>
    <fieldset><legend>Color del sector</legend><div className="draft-palette">{SECTOR_COLOR_PALETTE.map(color => <label key={color.hex} style={{backgroundColor:color.hex}} title={`${color.name} (${color.hex})`}><input type="radio" name="color" value={color.hex} defaultChecked={(editing?.color || SECTOR_COLOR_PALETTE[0].hex) === color.hex}/><span className="sr-only">{color.name}, {color.hex}</span></label>)}</div></fieldset>
    <label>Estado<select name="status" defaultValue={editing?.status ?? 'active'}><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="under_repair">En reparación</option></select></label><footer><button type="button" onClick={() => setEditing(undefined)}>Cancelar</button><button className="primary-btn" type="submit">Guardar en el borrador</button></footer>
  </form></DraftEditorModal>}</section>;
}
