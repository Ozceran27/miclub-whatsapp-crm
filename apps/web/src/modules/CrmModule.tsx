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
import { confirmAction, requestText } from './shared/ActionDialog';
import { nextCrmSort, type CrmSort } from './CRM/SortableHeader';

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
  const debtSort:CrmSort=filters.filter.sortBy?{by:filters.filter.sortBy,direction:filters.filter.sortDirection??'asc'}:null;
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
  const changeTemplate=async(id:string)=>{
    if(templateStatus==='dirty'&&!await confirmAction({title:'¿Descartar cambios?',description:'Tenés cambios sin guardar en la plantilla actual.',confirmLabel:'Descartar cambios'}))return;
    const chosen=data.templates.find(t=>t.id===id);if(!chosen)return;
    setSelectedTemplateId(id);setTemplateName(chosen.name);setMessage(chosen.body);setTemplateStatus('idle');
  };
  const fail=(error:unknown)=>data.setError(error instanceof Error?error.message:'No se pudo completar la acción.');
  const saveTemplate=async()=>{if(!selectedTemplate)return;try{const updated=await crmApi.updateTemplate(selectedTemplate.id,templateName,message);
    data.setTemplates(prev=>prev.map(t=>t.id===updated.id?updated:t));setTemplateStatus('saved');}catch(e){fail(e);}};
  const createTemplate=async()=>{const name=await requestText({title:'Nueva plantilla',inputLabel:'Nombre de la plantilla',confirmLabel:'Crear plantilla'});if(!name?.trim())return;
    try{const created=await crmApi.createTemplate(name.trim(),message||'Hola {nombre}, ');data.setTemplates(prev=>[...prev,created]);
      setSelectedTemplateId(created.id);setTemplateName(created.name);setMessage(created.body);setTemplateStatus('saved');}catch(e){fail(e);}};
  const duplicateTemplate=async()=>{if(!selectedTemplate)return;try{const created=await crmApi.createTemplate(`${templateName} (copia)`,message);
    data.setTemplates(prev=>[...prev,created]);setSelectedTemplateId(created.id);setTemplateName(created.name);setTemplateStatus('saved');}catch(e){fail(e);}};
  const deleteTemplate=async()=>{if(!selectedTemplate||selectedTemplate.isDefault||!await confirmAction({title:'¿Eliminar plantilla seleccionada?',description:'La plantilla dejará de estar disponible.',confirmLabel:'Eliminar plantilla'}))return;
    try{await crmApi.deleteTemplate(selectedTemplate.id);const rest=data.templates.filter(t=>t.id!==selectedTemplate.id);data.setTemplates(rest);
      setSelectedTemplateId(rest[0]?.id ?? '');setTemplateName(rest[0]?.name ?? '');setMessage(rest[0]?.body ?? '');setTemplateStatus('idle');}catch(e){fail(e);}};
  const prepare=async()=>{
    if(!filters.selected.length)return;
    setPreparing(true);data.setError(null);
    try{const validated=await crmApi.validateMessages(filters.selected,message,selectedTemplate?.name ?? templateName);
      if(validated.missingPhoneMembers.length)throw new Error(`${validated.missingPhoneMembers.length} inscripciones no tienen teléfono argentino válido.`);
      if(validated.unresolvedVariables.length)throw new Error(`Variables desconocidas: ${validated.unresolvedVariables.join(', ')}`);
      const warning=validated.duplicates.length?`\n${validated.duplicates.length} contactos tienen mensajes previos.`:'';
      if(!await confirmAction({title:`Preparar ${validated.selectedCount} mensajes`,description:`Ejemplo: ${validated.sampleMessage}${warning}`,confirmLabel:'Preparar mensajes'}))return;
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
      if(!await confirmAction({title:'Revisar saldo antes de abrir WhatsApp',description:`Saldo actual: ${money(current.balances)} (${current.overdueCount} cuotas). Revisá que el mensaje preparado siga vigente.`,confirmLabel:'Abrir WhatsApp'})){popup.close();return;}
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
    <MembersTable debts={data.debts} selected={filters.selected} setSelected={filters.setSelected} pageChange={page=>filters.change({page})} loading={data.loading}
      sort={debtSort} onSort={field=>{const next=nextCrmSort(debtSort,field);filters.change({sortBy:next?.by,sortDirection:next?.direction});}}/>
    {filters.filter.kind==='review'&&<div className="section-note">Estas inscripciones necesitan una cuota generada o una fecha de vencimiento válida antes de preparar un recordatorio de deuda.
      {canViewEnrollments&&<button className="icon-btn ghost-btn" onClick={()=>{navigate('/app/administration');window.setTimeout(()=>document.getElementById('enrollment-list')?.scrollIntoView({behavior:'smooth',block:'start'}),0);}}>Ir a Inscripciones</button>}</div>}
    {canWrite&&<MessageTemplatePanel templates={data.templates} selectedTemplateId={selectedTemplateId} handleTemplateChange={id=>{void changeTemplate(id);}}
      templateName={templateName} setTemplateName={setTemplateName} message={message} setMessage={setMessage}
      templateStatus={templateStatus} setTemplateStatus={setTemplateStatus} selectedTemplate={selectedTemplate}
      saveTemplate={saveTemplate} createTemplate={createTemplate} duplicateTemplate={duplicateTemplate} deleteTemplate={deleteTemplate}
      preview={preview(message,selectedDebt)} canPrepare={filters.selected.length>0&&message.trim().length>0&&!preparing}
      prepare={prepare} preparing={preparing}/>}
    <PreparedMessagesPanel prepared={data.prepared} page={data.preparedPage} total={data.preparedTotal}
      loadPage={data.loadPrepared} openWhatsApp={openWhatsApp} updatePreparedStatus={updatePreparedStatus} canWrite={canWrite}/>
    <CrmHistoryPanel history={data.history} historyPage={data.historyPage} historyMeta={data.historyMeta} loadHistory={data.loadHistory}
      sort={data.historySort} onSort={data.setHistorySort}/>
  </main>;
}

export default function CrmModule(){
  const {permissions,clubId}=useSession();
  const canOpenImported=permissions.includes(PERMISSIONS.CRM_READ)&&permissions.includes(PERMISSIONS.SECTORS_ANY);
  const [area,setArea]=useState<'operational'|'xlsx'>('operational');
  return <><nav className="crm-area-tabs" aria-label="Áreas del CRM">
    <button type="button" className="crm-area-tab" aria-current={area==='operational'?'page':undefined} onClick={()=>setArea('operational')}>Cobranza operativa</button>
    {canOpenImported&&<button type="button" className="crm-area-tab" aria-current={area==='xlsx'?'page':undefined} onClick={()=>setArea('xlsx')}>Contactos importados</button>}
  </nav>{area==='xlsx'&&canOpenImported?<CrmXlsxPanel key={clubId??'no-club'}/>:<OperationalCrm/>}</>;
}
