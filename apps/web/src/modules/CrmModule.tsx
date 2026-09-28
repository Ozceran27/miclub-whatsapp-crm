import { useEffect, useState } from 'react';
import { PERMISSIONS, type CrmDebt, type PreparedMessage } from '@miclub/shared';
import { crmApi } from '../services/api/crmApi';
import { useSession } from '../session';
import { useRouter } from '../router';
import { CrmSummaryCards } from './CRM/CrmSummaryCards';
import { CrmFilters } from './CRM/CrmFilters';
import { MembersTable, money } from './CRM/MembersTable';
import { MessageTemplatePanel } from './CRM/MessageTemplatePanel';
import { PreparedMessagesPanel } from './CRM/PreparedMessagesPanel';
import { CrmHistoryPanel } from './CRM/CrmHistoryPanel';
import { useCrmData } from './CRM/useCrmData';
import { useCrmFilters } from './CRM/useCrmFilters';
import type { MessageStatus } from './CRM/types';
import { CrmXlsxPanel } from './CRM/CrmXlsxPanel';

const preview=(template:string,debt?:CrmDebt)=>{
  if(!debt)return template;
  const balance=debt.balances.map(item=>`${item.amount.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${item.currencyCode}`).join(' y ');
  const values:Record<string,string>={nombre:debt.firstName,apellido:debt.lastName,actividad:debt.activityName,
    cuota:balance,saldo:balance,vencimientos:String(debt.overdueCount),
    primer_vencimiento:debt.firstDueDate ?? '',modalidad:debt.modality,instructor:debt.instructor};
  return template.replace(/\{(\w+)\}/g,(_,key:string)=>values[key.toLowerCase()] ?? '');
};

function OperationalCrm(){
  const {navigate}=useRouter();
  const {permissions}=useSession();
  const canRead=permissions.includes(PERMISSIONS.CRM_READ);
  const canWrite=permissions.includes(PERMISSIONS.CRM_WRITE);
  const canViewEnrollments=permissions.includes(PERMISSIONS.ENROLLMENTS_VIEW);
  const filters=useCrmFilters();
  const data=useCrmData(filters.filter);
  const [selectedTemplateId,setSelectedTemplateId]=useState('');
  const [templateName,setTemplateName]=useState('');
  const [message,setMessage]=useState('');
  const [templateStatus,setTemplateStatus]=useState<'idle'|'dirty'|'saved'>('idle');
  const [preparing,setPreparing]=useState(false);
  const selectedTemplate=data.templates.find(t=>t.id===selectedTemplateId);

  useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(!active)return;
    const current=data.templates.find(t=>t.id===selectedTemplateId) ?? data.templates[0];
    if(!current)return;
    if(!selectedTemplateId)setSelectedTemplateId(current.id);
    if(templateStatus!=='dirty'){setTemplateName(current.name);setMessage(current.body);}
  });return()=>{active=false;};},[data.templates,selectedTemplateId,templateStatus]);
  const changeTemplate=(id:string)=>{
    if(templateStatus==='dirty'&&!window.confirm('Tenés cambios sin guardar. ¿Deseás descartarlos?'))return;
    const chosen=data.templates.find(t=>t.id===id);if(!chosen)return;
    setSelectedTemplateId(id);setTemplateName(chosen.name);setMessage(chosen.body);setTemplateStatus('idle');
  };
  const fail=(error:unknown)=>data.setError(error instanceof Error?error.message:'No se pudo completar la acción.');
  const saveTemplate=async()=>{if(!selectedTemplate)return;try{const updated=await crmApi.updateTemplate(selectedTemplate.id,templateName,message);
    data.setTemplates(prev=>prev.map(t=>t.id===updated.id?updated:t));setTemplateStatus('saved');}catch(e){fail(e);}};
  const createTemplate=async()=>{const name=window.prompt('Nombre de la nueva plantilla:');if(!name?.trim())return;
    try{const created=await crmApi.createTemplate(name.trim(),message||'Hola {nombre}, ');data.setTemplates(prev=>[...prev,created]);
      setSelectedTemplateId(created.id);setTemplateName(created.name);setMessage(created.body);setTemplateStatus('saved');}catch(e){fail(e);}};
  const duplicateTemplate=async()=>{if(!selectedTemplate)return;try{const created=await crmApi.createTemplate(`${templateName} (copia)`,message);
    data.setTemplates(prev=>[...prev,created]);setSelectedTemplateId(created.id);setTemplateName(created.name);setTemplateStatus('saved');}catch(e){fail(e);}};
  const deleteTemplate=async()=>{if(!selectedTemplate||selectedTemplate.isDefault||!window.confirm('¿Eliminar plantilla seleccionada?'))return;
    try{await crmApi.deleteTemplate(selectedTemplate.id);const rest=data.templates.filter(t=>t.id!==selectedTemplate.id);data.setTemplates(rest);
      setSelectedTemplateId(rest[0]?.id ?? '');setTemplateName(rest[0]?.name ?? '');setMessage(rest[0]?.body ?? '');setTemplateStatus('idle');}catch(e){fail(e);}};
  const resetDefaultTemplates=async()=>{if(!window.confirm('Esto restaurará las plantillas predeterminadas.'))return;
    try{const restored=await crmApi.resetTemplates();data.setTemplates(restored);setSelectedTemplateId(restored[0]?.id ?? '');
      setTemplateName(restored[0]?.name ?? '');setMessage(restored[0]?.body ?? '');setTemplateStatus('idle');}catch(e){fail(e);}};
  const prepare=async()=>{
    if(!filters.selected.length)return;
    setPreparing(true);data.setError(null);
    try{const validated=await crmApi.validateMessages(filters.selected,message,selectedTemplate?.name ?? templateName);
      if(validated.missingPhoneMembers.length)throw new Error(`${validated.missingPhoneMembers.length} inscripciones no tienen teléfono argentino válido.`);
      if(validated.unresolvedVariables.length)throw new Error(`Variables desconocidas: ${validated.unresolvedVariables.join(', ')}`);
      const warning=validated.duplicates.length?`\n${validated.duplicates.length} contactos tienen mensajes previos.`:'';
      if(!window.confirm(`Preparar ${validated.selectedCount} mensajes.\nEjemplo: ${validated.sampleMessage}${warning}`))return;
      await crmApi.prepareMessages(filters.selected,message,selectedTemplate?.name ?? templateName);
      filters.clearSelection();await Promise.all([data.loadPrepared(1),data.loadHistory(1),data.loadDebts()]);
    }catch(e){fail(e);}finally{setPreparing(false);}
  };
  const updatePreparedStatus=async(historyId:number|undefined,status:MessageStatus)=>{
    if(!historyId)return;try{await crmApi.updateHistoryStatus(historyId,status);await Promise.all([data.loadPrepared(data.preparedPage),data.loadHistory(1)]);}catch(e){fail(e);}
  };
  const openWhatsApp=async(item:PreparedMessage)=>{
    const popup=window.open('about:blank','_blank');
    if(!popup){data.setError('El navegador bloqueó la ventana de WhatsApp.');return;}
    try{const current=item.enrollmentId?await crmApi.eligibility(item.enrollmentId):null;
      if(!current?.eligible){popup.close();throw new Error('La deuda ya no está vencida o no tenés acceso a esta inscripción.');}
      if(current.phone!==item.phone){popup.close();throw new Error('El teléfono cambió. Prepará un nuevo mensaje con los datos actuales.');}
      if(!window.confirm(`Saldo actual: ${money(current.balances)} (${current.overdueCount} cuotas). Revisá que el mensaje preparado siga vigente antes de abrir WhatsApp.`)){popup.close();return;}
      popup.opener=null;popup.location.href=item.waLink;await updatePreparedStatus(item.historyId,'opened');
    }catch(e){popup.close();fail(e);}
  };
  if(!canRead)return <section className="section-panel" role="alert"><h2>No tenés acceso al CRM</h2></section>;
  const selectedDebt=data.debts.items.find(d=>d.enrollmentId===filters.selected[0]);
  return <main className="module-content crm-module">
    <header className="module-hero module-hero--compact"><div><p className="eyebrow">Módulo CRM</p><h2>miClub WhatsApp CRM</h2><p>Cuotas vencidas y recordatorios manuales por WhatsApp.</p></div></header>
    <button className="icon-btn" onClick={()=>void data.refresh()}>↻ Actualizar datos</button>
    {data.error&&<p className="error-msg" role="alert">{data.error}</p>}
    <CrmSummaryCards summary={data.summary}/>
    <CrmFilters filter={filters.filter} change={filters.change} catalog={data.catalog}/>
    <MembersTable debts={data.debts} selected={filters.selected} setSelected={filters.setSelected} pageChange={page=>filters.change({page})} loading={data.loading}/>
    {filters.filter.kind==='review'&&<div className="section-note">Estas inscripciones necesitan una cuota generada o una fecha de vencimiento válida antes de preparar un recordatorio de deuda.
      {canViewEnrollments&&<button className="icon-btn ghost-btn" onClick={()=>{navigate('/app/administration');window.setTimeout(()=>document.getElementById('enrollment-list')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}}>Ir a Inscripciones</button>}</div>}
    {canWrite&&<MessageTemplatePanel templates={data.templates} selectedTemplateId={selectedTemplateId} handleTemplateChange={changeTemplate}
      templateName={templateName} setTemplateName={setTemplateName} message={message} setMessage={setMessage}
      templateStatus={templateStatus} setTemplateStatus={setTemplateStatus} selectedTemplate={selectedTemplate}
      saveTemplate={saveTemplate} createTemplate={createTemplate} duplicateTemplate={duplicateTemplate} deleteTemplate={deleteTemplate}
      resetDefaultTemplates={resetDefaultTemplates} preview={preview(message,selectedDebt)} canPrepare={filters.selected.length>0&&message.trim().length>0&&!preparing}
      prepare={prepare} preparing={preparing}/>}
    <PreparedMessagesPanel prepared={data.prepared} page={data.preparedPage} total={data.preparedTotal}
      loadPage={data.loadPrepared} openWhatsApp={openWhatsApp} updatePreparedStatus={updatePreparedStatus} canWrite={canWrite}/>
    <CrmHistoryPanel history={data.history} historyPage={data.historyPage} historyMeta={data.historyMeta} loadHistory={data.loadHistory}/>
  </main>;
}

export default function CrmModule(){
  const {permissions,clubId}=useSession();
  const canOpenImported=permissions.includes(PERMISSIONS.CRM_READ)&&permissions.includes(PERMISSIONS.SECTORS_ANY);
  const [area,setArea]=useState<'operational'|'xlsx'>('operational');
  return <><nav className="actions-row" aria-label="Áreas del CRM">
    <button type="button" className="icon-btn" aria-pressed={area==='operational'} onClick={()=>setArea('operational')}>Cobranza operativa</button>
    {canOpenImported&&<button type="button" className="icon-btn" aria-pressed={area==='xlsx'} onClick={()=>setArea('xlsx')}>Contactos importados</button>}
  </nav>{area==='xlsx'&&canOpenImported?<CrmXlsxPanel key={clubId??'no-club'}/>:<OperationalCrm/>}</>;
}
