import { apiFetch, apiJson, readApiError } from '../../api';

const path=(suffix:string)=>`/api/crm/xlsx${suffix}` as `/${string}`;
export type XlsxStatus='al_dia'|'nuevo_inscripto'|'adeudando'|'abandonado';
export type XlsxContact={id:string;batchId:string;sourceRow:number;document:string;contactKey:string;firstName:string;lastName:string;phone:string;status:XlsxStatus;activity:string|null;enrollmentDate:string|null;dueDate:string|null;lastSentAt:string|null};
export type XlsxIssue={row:number;field:string;message:string};
export type XlsxPage<T>={items:T[];total:number;page:number;pageSize:number};
export type XlsxTemplate={id:string;name:string;body:string};
export type XlsxBatch={id:string;status:'active'|'replaced';rowCount:number;version:string;createdAt:string;activatedAt:string|null};
export type XlsxMessage={id:string;contactId:string;name:string;activity:string|null;phone:string;message:string;waLink:string;status:'prepared'|'opened'|'sent_manual'|'skipped';templateName:string|null;createdAt:string;openedAt:string|null;sentAt:string|null;fresh:boolean};
export type DryRun={dryRunId:string;version:string;rowCount:number;preview:Omit<XlsxContact,'id'|'batchId'|'lastSentAt'>[];issues:XlsxIssue[]};
const sendFile=async(url:string,file:File,dryRunId?:string)=>{
  const form=new FormData();form.append('file',file);if(dryRunId)form.append('dryRunId',dryRunId);
  const response=await apiFetch(path(url),{method:'POST',body:form});
  if(!response.ok){const payload=await response.clone().json().catch(()=>null) as {issues?:XlsxIssue[]}|null;
    const error=await readApiError(response) as Error&{issues?:XlsxIssue[]};error.issues=payload?.issues;throw error;}
  return response.json() as Promise<unknown>;
};
const json=(method:string,body:unknown):RequestInit=>({method,body:JSON.stringify(body)});
export const crmXlsxApi={
  async download(){const response=await apiFetch(path('/template'));if(!response.ok)throw await readApiError(response);
    const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='CRM_CONTACTOS_v1.xlsx';document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);},
  dryRun:(file:File)=>sendFile('/dry-run',file) as Promise<DryRun>,
  apply:(file:File,dryRunId:string)=>sendFile('/apply',file,dryRunId) as Promise<{batchId:string;rowCount:number}>,
  summary:()=>apiJson<{counts:Partial<Record<XlsxStatus,number>>}>(path('/summary')),
  batches:()=>apiJson<XlsxBatch[]>(path('/batches')),
  contacts:(page:number,status:string,query:string,sortBy?:string,sortDirection?:'asc'|'desc')=>apiJson<XlsxPage<XlsxContact>>(path(`/contacts?${new URLSearchParams({page:String(page),...(status?{status}:{}),...(query?{query}:{}),...(sortBy?{sortBy,sortDirection:sortDirection??'asc'}:{})})}`)),
  templates:()=>apiJson<XlsxTemplate[]>(path('/templates')),
  createTemplate:(name:string,body:string)=>apiJson<XlsxTemplate>(path('/templates'),json('POST',{name,body})),
  updateTemplate:(id:string,name:string,body:string)=>apiJson<XlsxTemplate>(path(`/templates/${id}`),json('PATCH',{name,body})),
  deleteTemplate:(id:string)=>apiJson<void>(path(`/templates/${id}`),{method:'DELETE'}),
  preview:(contactIds:string[],message:string)=>apiJson<{count:number;sample:string}>(path('/prepare/preview'),json('POST',{contactIds,message})),
  prepare:(contactIds:string[],message:string,templateName:string)=>apiJson<unknown[]>(path('/prepare'),json('POST',{contactIds,message,templateName})),
  messages:(page:number,pending:boolean,sortBy?:string,sortDirection?:'asc'|'desc',status?:'sent_manual')=>apiJson<XlsxPage<XlsxMessage>>(path(`/messages?${new URLSearchParams({page:String(page),pending:String(pending),...(sortBy?{sortBy,sortDirection:sortDirection??'asc'}:{}),...(status?{status}:{})})}`)),
  open:(id:string)=>apiJson<{waLink:string}>(path(`/messages/${id}/open`),{method:'POST'}),
  status:(id:string,status:'sent_manual'|'skipped')=>apiJson<{id:string;status:string}>(path(`/messages/${id}/status`),json('PATCH',{status})),
};
