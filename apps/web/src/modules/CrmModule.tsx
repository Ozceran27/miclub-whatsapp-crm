import { useEffect, useState } from 'react';
import type { PreparedMessage } from '@miclub/shared';
import { crmApi } from '../services/api/crmApi';
import { CrmSummaryCards } from './CRM/CrmSummaryCards';
import { CrmFilters } from './CRM/CrmFilters';
import { MembersTable } from './CRM/MembersTable';
import { MessageTemplatePanel } from './CRM/MessageTemplatePanel';
import { PreparedMessagesPanel } from './CRM/PreparedMessagesPanel';
import { CrmHistoryPanel } from './CRM/CrmHistoryPanel';
import { fill } from './CRM/formatters';
import { Icon } from './CRM/Icon';
import { useCrmData } from './CRM/useCrmData';
import { useCrmFilters } from './CRM/useCrmFilters';
import type { MessageStatus } from './CRM/types';
import { ACTIONABLE_STATUSES } from './CRM/types';

export default function CrmModule() {
  const { members, debtors, templates, setTemplates, summary, prepared, setPrepared, history, historyPage, historyMeta, contactedRecent, syncStatus, syncing, error, setError, loadHistory, sync } = useCrmData();
  const filters = useCrmFilters(members, debtors, contactedRecent);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  const [message, setMessage] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<'idle' | 'dirty' | 'saved'>('idle');

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  useEffect(() => {
    const firstTemplate = templates[0];
    if (firstTemplate && !selectedTemplateId) setSelectedTemplateId(firstTemplate.id);
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateName(selectedTemplate.name);
    setMessage(selectedTemplate.body);
    setTemplateStatus('idle');
  }, [selectedTemplateId, selectedTemplate?.updatedAt]);

  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    const updated = await crmApi.updateTemplate(selectedTemplate.id, templateName, message);
    setTemplates((prev) => prev.map((template) => (template.id === updated.id ? updated : template)));
    setTemplateStatus('saved');
  };
  const handleTemplateChange = (nextId: string) => {
    if (templateStatus === 'dirty' && !window.confirm('Tenés cambios sin guardar. ¿Deseás descartarlos?')) return;
    setSelectedTemplateId(nextId);
  };
  const createTemplate = async () => {
    const name = window.prompt('Nombre de la nueva plantilla:');
    if (!name?.trim()) return;
    const created = await crmApi.createTemplate(name.trim(), message || 'Hola {nombre}, ');
    setTemplates((prev) => [...prev, created]);
    setSelectedTemplateId(created.id);
    setTemplateStatus('saved');
  };
  const duplicateTemplate = async () => {
    if (!selectedTemplate) return;
    const duplicated = await crmApi.createTemplate(`${templateName} (copia)`, message);
    setTemplates((prev) => [...prev, duplicated]);
    setSelectedTemplateId(duplicated.id);
    setTemplateStatus('saved');
  };
  const deleteTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.isDefault) return;
    if (!window.confirm('¿Eliminar plantilla seleccionada?')) return;
    await crmApi.deleteTemplate(selectedTemplate.id);
    const remaining = templates.filter((template) => template.id !== selectedTemplate.id);
    setTemplates(remaining);
    if (remaining[0]) setSelectedTemplateId(remaining[0].id);
  };
  const resetDefaultTemplates = async () => {
    if (!window.confirm('Esto restaurará las plantillas predeterminadas y quitará las personalizadas.')) return;
    const restored = await crmApi.resetTemplates();
    setTemplates(restored);
    if (restored[0]) setSelectedTemplateId(restored[0].id);
    setTemplateStatus('saved');
  };
  const prepare = async () => {
    if (filters.selected.length === 0) { setError('Seleccioná al menos un miembro Adeudando antes de preparar mensajes.'); return; }
    setPreparing(true); setError(null);
    try {
      const validation = await crmApi.validateMessages(filters.selected, message, selectedTemplate?.name ?? templateName);
      if (validation.missingPhoneMembers.length > 0) throw new Error(`Hay ${validation.missingPhoneMembers.length} miembros sin teléfono válido.`);
      if (validation.unresolvedVariables.length > 0) throw new Error(`Hay variables sin reemplazar en el mensaje: ${validation.unresolvedVariables.join(', ')}`);
      const previewClients = validation.selectedPreview.map((c) => c.nombre).join(', ');
      const duplicateWarning = validation.duplicates.length > 0 ? `\nAviso: ${validation.duplicates.length} clientes tienen mensajes recientes.` : '';
      const batchWarning = validation.selectedCount > 1 ? `\n⚠ Vas a preparar ${validation.selectedCount} mensajes. Revisá antes de abrir WhatsApp.` : '';
      const confirmText = `Confirmar preparación\nCantidad: ${validation.selectedCount}\nPrimeros clientes: ${previewClients}\nActividad: ${validation.selectedPreview[0]?.actividad ?? '-'}\nCuota: ${validation.selectedPreview[0]?.cuota ?? '-'}\nMensaje ejemplo: ${validation.sampleMessage}${duplicateWarning}${batchWarning}`;
      if (!window.confirm(confirmText)) return;
      setPrepared(await crmApi.prepareMessages(filters.selected, message, selectedTemplate?.name ?? templateName));
      await loadHistory();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error desconocido al preparar mensajes.'); } finally { setPreparing(false); }
  };
  const updatePreparedStatus = async (historyId: number | undefined, status: MessageStatus) => {
    if (!historyId) return;
    await crmApi.updateHistoryStatus(historyId, status);
    setPrepared(prev => prev.map((item) => (item.historyId === historyId ? { ...item, status } : item)).filter((item) => ACTIONABLE_STATUSES.includes(item.status ?? 'prepared')));
    await loadHistory();
  };
  const openWhatsApp = async (item: PreparedMessage) => {
    window.open(item.waLink, '_blank', 'noopener,noreferrer');
    await updatePreparedStatus(item.historyId, 'opened');
  };

  const previewMember = members.find((d) => d.id === filters.selected[0]);
  const preview = fill(message, previewMember);
  const canPrepare = filters.selected.length > 0 && message.trim().length > 0 && !preparing;

  return <main className="module-content crm-module">
    <header className="module-hero module-hero--compact"><div><p className="eyebrow">Módulo CRM</p><h2>miClub WhatsApp CRM</h2><p>Gestión de cobranzas y mensajes por WhatsApp.</p></div></header>
    <button className="icon-btn" onClick={() => void sync()} disabled={syncing}><Icon label="↻" />{syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
    {error && <p className="error-msg">Error: {error}</p>}
    <CrmSummaryCards summary={summary} members={members} debtors={debtors} syncStatus={syncStatus} />
    <CrmFilters {...filters} />
    <MembersTable filtered={filters.filtered} selected={filters.selected} setSelected={filters.setSelected} contactedRecent={contactedRecent} changeSort={filters.changeSort} renderSortIndicator={filters.renderSortIndicator} toggleAllDebtors={filters.toggleAllDebtors} clearSelection={filters.clearSelection} />
    <MessageTemplatePanel templates={templates} selectedTemplateId={selectedTemplateId} handleTemplateChange={handleTemplateChange} templateName={templateName} setTemplateName={setTemplateName} message={message} setMessage={setMessage} templateStatus={templateStatus} setTemplateStatus={setTemplateStatus} selectedTemplate={selectedTemplate} saveTemplate={saveTemplate} createTemplate={createTemplate} duplicateTemplate={duplicateTemplate} deleteTemplate={deleteTemplate} resetDefaultTemplates={resetDefaultTemplates} preview={preview} canPrepare={canPrepare} prepare={prepare} preparing={preparing} />
    <PreparedMessagesPanel prepared={prepared} setPrepared={setPrepared} openWhatsApp={openWhatsApp} updatePreparedStatus={updatePreparedStatus} />
    <CrmHistoryPanel history={history} historyPage={historyPage} historyMeta={historyMeta} loadHistory={loadHistory} />
  </main>;
}
