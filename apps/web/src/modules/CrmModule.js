import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { apiUrl } from '../api';
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
import { ACTIONABLE_STATUSES } from './CRM/types';
export default function CrmModule() {
    const { members, debtors, templates, setTemplates, summary, prepared, setPrepared, history, historyPage, historyMeta, contactedRecent, syncStatus, syncing, error, setError, loadHistory, sync } = useCrmData();
    const filters = useCrmFilters(members, debtors, contactedRecent);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [message, setMessage] = useState('');
    const [preparing, setPreparing] = useState(false);
    const [templateStatus, setTemplateStatus] = useState('idle');
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    useEffect(() => {
        const firstTemplate = templates[0];
        if (firstTemplate && !selectedTemplateId)
            setSelectedTemplateId(firstTemplate.id);
    }, [templates, selectedTemplateId]);
    useEffect(() => {
        if (!selectedTemplate)
            return;
        setTemplateName(selectedTemplate.name);
        setMessage(selectedTemplate.body);
        setTemplateStatus('idle');
    }, [selectedTemplateId, selectedTemplate?.updatedAt]);
    const saveTemplate = async () => {
        if (!selectedTemplate)
            return;
        const res = await fetch(apiUrl(`/templates/${selectedTemplate.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: templateName, body: message }) });
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo guardar la plantilla.');
        }
        const updated = (await res.json());
        setTemplates((prev) => prev.map((template) => (template.id === updated.id ? updated : template)));
        setTemplateStatus('saved');
    };
    const handleTemplateChange = (nextId) => {
        if (templateStatus === 'dirty' && !window.confirm('Tenés cambios sin guardar. ¿Deseás descartarlos?'))
            return;
        setSelectedTemplateId(nextId);
    };
    const createTemplate = async () => {
        const name = window.prompt('Nombre de la nueva plantilla:');
        if (!name?.trim())
            return;
        const res = await fetch(apiUrl('/templates'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), body: message || 'Hola {nombre}, ' }) });
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo crear la plantilla.');
        }
        const created = (await res.json());
        setTemplates((prev) => [...prev, created]);
        setSelectedTemplateId(created.id);
        setTemplateStatus('saved');
    };
    const duplicateTemplate = async () => {
        if (!selectedTemplate)
            return;
        const res = await fetch(apiUrl('/templates'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${templateName} (copia)`, body: message }) });
        if (!res.ok)
            throw new Error('No se pudo duplicar la plantilla.');
        const duplicated = (await res.json());
        setTemplates((prev) => [...prev, duplicated]);
        setSelectedTemplateId(duplicated.id);
        setTemplateStatus('saved');
    };
    const deleteTemplate = async () => {
        if (!selectedTemplate || selectedTemplate.isDefault)
            return;
        if (!window.confirm('¿Eliminar plantilla seleccionada?'))
            return;
        const res = await fetch(apiUrl(`/templates/${selectedTemplate.id}`), { method: 'DELETE' });
        if (!res.ok)
            throw new Error('No se pudo eliminar la plantilla.');
        const remaining = templates.filter((template) => template.id !== selectedTemplate.id);
        setTemplates(remaining);
        if (remaining[0])
            setSelectedTemplateId(remaining[0].id);
    };
    const resetDefaultTemplates = async () => {
        if (!window.confirm('Esto restaurará las plantillas predeterminadas y quitará las personalizadas.'))
            return;
        const res = await fetch(apiUrl('/templates/reset-defaults'), { method: 'POST' });
        if (!res.ok)
            throw new Error('No se pudieron restaurar plantillas.');
        const restored = (await res.json());
        setTemplates(restored);
        if (restored[0])
            setSelectedTemplateId(restored[0].id);
        setTemplateStatus('saved');
    };
    const prepare = async () => {
        if (filters.selected.length === 0) {
            setError('Seleccioná al menos un miembro Adeudando antes de preparar mensajes.');
            return;
        }
        setPreparing(true);
        setError(null);
        try {
            const validationRes = await fetch(apiUrl('/prepare-messages/validate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: filters.selected, message, templateName: selectedTemplate?.name ?? templateName }) });
            if (!validationRes.ok) {
                const payload = (await validationRes.json());
                throw new Error(payload.message ?? 'No se pudo validar la preparación de mensajes.');
            }
            const validation = (await validationRes.json());
            if (validation.missingPhoneMembers.length > 0)
                throw new Error(`Hay ${validation.missingPhoneMembers.length} miembros sin teléfono válido.`);
            if (validation.unresolvedVariables.length > 0)
                throw new Error(`Hay variables sin reemplazar en el mensaje: ${validation.unresolvedVariables.join(', ')}`);
            const previewClients = validation.selectedPreview.map((c) => c.nombre).join(', ');
            const duplicateWarning = validation.duplicates.length > 0 ? `\nAviso: ${validation.duplicates.length} clientes tienen mensajes recientes.` : '';
            const batchWarning = validation.selectedCount > 1 ? `\n⚠ Vas a preparar ${validation.selectedCount} mensajes. Revisá antes de abrir WhatsApp.` : '';
            const confirmText = `Confirmar preparación\nCantidad: ${validation.selectedCount}\nPrimeros clientes: ${previewClients}\nActividad: ${validation.selectedPreview[0]?.actividad ?? '-'}\nCuota: ${validation.selectedPreview[0]?.cuota ?? '-'}\nMensaje ejemplo: ${validation.sampleMessage}${duplicateWarning}${batchWarning}`;
            if (!window.confirm(confirmText))
                return;
            const res = await fetch(apiUrl('/prepare-messages'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: filters.selected, message, templateName: selectedTemplate?.name ?? templateName }) });
            if (!res.ok) {
                const payload = (await res.json());
                throw new Error(payload.message ?? 'No se pudieron preparar mensajes.');
            }
            setPrepared(await res.json());
            await loadHistory();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido al preparar mensajes.');
        }
        finally {
            setPreparing(false);
        }
    };
    const updatePreparedStatus = async (historyId, status) => {
        if (!historyId)
            return;
        const res = await fetch(apiUrl(`/history/${historyId}/status`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo actualizar el estado.');
        }
        setPrepared(prev => prev.map((item) => (item.historyId === historyId ? { ...item, status } : item)).filter((item) => ACTIONABLE_STATUSES.includes(item.status ?? 'prepared')));
        await loadHistory();
    };
    const openWhatsApp = async (item) => {
        window.open(item.waLink, '_blank', 'noopener,noreferrer');
        await updatePreparedStatus(item.historyId, 'opened');
    };
    const previewMember = members.find((d) => d.id === filters.selected[0]);
    const preview = fill(message, previewMember);
    const canPrepare = filters.selected.length > 0 && message.trim().length > 0 && !preparing;
    return _jsxs("main", { className: "module-content crm-module", children: [_jsx("header", { className: "module-hero module-hero--compact", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "M\u00F3dulo CRM" }), _jsx("h2", { children: "miClub WhatsApp CRM" }), _jsx("p", { children: "Gesti\u00F3n de cobranzas y mensajes por WhatsApp." })] }) }), _jsxs("button", { className: "icon-btn", onClick: () => void sync(), disabled: syncing, children: [_jsx(Icon, { label: "\u21BB" }), syncing ? 'Sincronizando...' : 'Sincronizar'] }), error && _jsxs("p", { className: "error-msg", children: ["Error: ", error] }), _jsx(CrmSummaryCards, { summary: summary, members: members, debtors: debtors, syncStatus: syncStatus }), _jsx(CrmFilters, { ...filters }), _jsx(MembersTable, { filtered: filters.filtered, selected: filters.selected, setSelected: filters.setSelected, contactedRecent: contactedRecent, changeSort: filters.changeSort, renderSortIndicator: filters.renderSortIndicator, toggleAllDebtors: filters.toggleAllDebtors, clearSelection: filters.clearSelection }), _jsx(MessageTemplatePanel, { templates: templates, selectedTemplateId: selectedTemplateId, handleTemplateChange: handleTemplateChange, templateName: templateName, setTemplateName: setTemplateName, message: message, setMessage: setMessage, templateStatus: templateStatus, setTemplateStatus: setTemplateStatus, selectedTemplate: selectedTemplate, saveTemplate: saveTemplate, createTemplate: createTemplate, duplicateTemplate: duplicateTemplate, deleteTemplate: deleteTemplate, resetDefaultTemplates: resetDefaultTemplates, preview: preview, canPrepare: canPrepare, prepare: prepare, preparing: preparing }), _jsx(PreparedMessagesPanel, { prepared: prepared, setPrepared: setPrepared, openWhatsApp: openWhatsApp, updatePreparedStatus: updatePreparedStatus }), _jsx(CrmHistoryPanel, { history: history, historyPage: historyPage, historyMeta: historyMeta, loadHistory: loadHistory })] });
}
