import type { MessageTemplate } from '@miclub/shared';
import { Icon } from './Icon';

type Props = { templates: MessageTemplate[]; selectedTemplateId: string; handleTemplateChange: (id: string) => void; templateName: string; setTemplateName: (value: string) => void; message: string; setMessage: (value: string) => void; templateStatus: 'idle' | 'dirty' | 'saved'; setTemplateStatus: (value: 'idle' | 'dirty' | 'saved') => void; selectedTemplate?: MessageTemplate; saveTemplate: () => Promise<void>; createTemplate: () => Promise<void>; duplicateTemplate: () => Promise<void>; deleteTemplate: () => Promise<void>; preview: string; canPrepare: boolean; prepare: () => Promise<void>; preparing: boolean };
export const MessageTemplatePanel = ({ templates, selectedTemplateId, handleTemplateChange, templateName, setTemplateName, message, setMessage, templateStatus, setTemplateStatus, selectedTemplate, saveTemplate, createTemplate, duplicateTemplate, deleteTemplate, preview, canPrepare, prepare, preparing }: Props) => <section className="composer">
  <div className="crm-composer-grid">
    <div className="crm-composer-details">
      <label>Plantilla<select onChange={(e) => handleTemplateChange(e.target.value)} value={selectedTemplateId}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Nombre de la plantilla<input value={templateName} onChange={(e) => { setTemplateName(e.target.value); setTemplateStatus('dirty'); }} placeholder="Nombre de plantilla" /></label>
      <p className="section-note">Variables: {'{nombre}'}, {'{apellido}'}, {'{actividad}'}, {'{saldo}'}, {'{vencimientos}'} y {'{primer_vencimiento}'}.</p>
      <p><strong>Estado:</strong> {templateStatus === 'dirty' ? 'Cambios sin guardar' : templateStatus === 'saved' ? 'Plantilla guardada' : 'Sin cambios'}</p>
      <div className="actions-row"><button className="icon-btn" onClick={() => void saveTemplate()} disabled={!selectedTemplate || templateStatus !== 'dirty'}><Icon label="💾" />Guardar cambios</button><button className="icon-btn" onClick={() => void createTemplate()}><Icon label="＋" />Crear plantilla</button><button className="icon-btn" onClick={() => void duplicateTemplate()} disabled={!selectedTemplate}><Icon label="⧉" />Duplicar plantilla</button>{selectedTemplate&&!selectedTemplate.isDefault&&<button className="icon-btn" onClick={() => void deleteTemplate()}><Icon label="🗑" />Eliminar plantilla</button>}</div>
    </div>
    <label className="crm-composer-editor">Mensaje de la plantilla<textarea value={message} onChange={e => { setMessage(e.target.value); setTemplateStatus('dirty'); }} rows={12} /></label>
  </div>
  <div className="crm-composer-preview"><h3>Vista previa</h3><pre>{preview}</pre></div>
  <div className="crm-composer-submit"><button className="icon-btn" disabled={!canPrepare} onClick={() => void prepare()}><Icon label="✉" />{preparing ? 'Preparando...' : 'Preparar mensajes'}</button></div>
</section>;
