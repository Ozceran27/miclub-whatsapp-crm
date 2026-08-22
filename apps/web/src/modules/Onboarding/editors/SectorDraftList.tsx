import type { OnboardingSectorDraft } from '@miclub/shared';
import { useState, type FormEvent } from 'react';
import { DraftEditorModal } from './DraftEditorModal';

const templates = [
  { id: 'futbol', name: 'Fútbol', icon: '⚽' }, { id: 'pileta', name: 'Pileta', icon: '🏊' },
  { id: 'gimnasio', name: 'Gimnasio', icon: '🏋️' }, { id: 'tenis', name: 'Tenis', icon: '🎾' },
  { id: 'salon', name: 'Salón social', icon: '🏛️' }, { id: 'otro', name: 'Otro sector', icon: '📍' },
];
const colors = ['#2563EB', '#047857', '#B45309', '#B91C1C', '#7C3AED', '#0E7490'];
const statusLabel = { active: 'Activo', inactive: 'Inactivo', under_repair: 'En reparación' };
const systemIcons: Record<string,string> = { administracion: '🏢', tesoreria: '💰', 'areas-comunes': '🏟️' };

export function SectorDraftList({ items, onChange }: { items: OnboardingSectorDraft[]; onChange: (items: OnboardingSectorDraft[]) => void }) {
  const [editing, setEditing] = useState<OnboardingSectorDraft | null>();
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name')).trim();
    const templateId = String(data.get('templateId')); const current = editing || undefined;
    const value: OnboardingSectorDraft = { clientId: current?.clientId ?? crypto.randomUUID(), templateId, code: current?.code ?? name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-'), name, color: String(data.get('color')), status: String(data.get('status')) as OnboardingSectorDraft['status'], isSystem: false };
    onChange(current ? items.map(item => item.clientId === current.clientId ? value : item) : [...items, value]); setEditing(undefined);
  };
  return <section className="draft-editor"><h3>Sectores del club</h3><div className="draft-card-grid">
    {items.map(item => { const template = templates.find(entry => entry.id === item.templateId); return <article className="draft-card" key={item.clientId}>
      <span className="draft-card__icon" aria-hidden="true">{systemIcons[item.code] ?? template?.icon ?? '📍'}</span><div className="draft-card__body"><strong>{item.name}</strong><span><i className="draft-color" style={{ backgroundColor:item.color }}/> {statusLabel[item.status]}</span>{item.isSystem && <small>Elemento del sistema · protegido</small>}</div>
      <div className="draft-card__actions">{item.isSystem ? <span className="draft-lock" title="No se puede modificar">🔒</span> : <><button type="button" className="draft-icon-button" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`}>✎</button><button type="button" className="draft-icon-button draft-icon-button--danger" onClick={() => onChange(items.filter(value => value.clientId !== item.clientId))} aria-label={`Eliminar ${item.name}`}>🗑</button></>}</div>
    </article>; })}
    <button className="draft-add-card" type="button" onClick={() => setEditing(null)}><span aria-hidden="true">＋</span><strong>Agregar Nuevo Sector</strong></button>
  </div>{editing !== undefined && <DraftEditorModal title={editing ? 'Editar sector' : 'Agregar Nuevo Sector'} onClose={() => setEditing(undefined)}><form className="draft-form" onSubmit={save}>
    <fieldset><legend>Elegí una plantilla</legend><div className="draft-template-grid">{templates.map(template => <label key={template.id}><input type="radio" name="templateId" value={template.id} defaultChecked={(editing?.templateId || 'futbol') === template.id}/><span aria-hidden="true">{template.icon}</span><strong>{template.name}</strong></label>)}</div></fieldset>
    <label>Nombre<input name="name" required defaultValue={editing?.name}/></label><fieldset><legend>Color del sector</legend><div className="draft-palette">{colors.map(color => <label key={color} style={{backgroundColor:color}} title={color}><input type="radio" name="color" value={color} defaultChecked={(editing?.color || colors[0]) === color}/><span className="sr-only">Color {color}</span></label>)}</div></fieldset>
    <label>Estado<select name="status" defaultValue={editing?.status ?? 'active'}><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="under_repair">En reparación</option></select></label><footer><button type="button" onClick={() => setEditing(undefined)}>Cancelar</button><button className="primary-btn" type="submit">Guardar en el borrador</button></footer>
  </form></DraftEditorModal>}</section>;
}
