import { createHash } from 'node:crypto';
import { normalizeArPhone } from './messages.js';
import { inspectZip } from './xlsxMigration/zipInspector.js';
import { parseWorkbookDate, readWorkbookEntry, sharedStringTable, workbookCells, workbookSheetEntries } from './xlsxMigration/validator.js';
import { XLSX_POLICY } from './xlsxMigration/policy.js';

export const CRM_XLSX_VERSION='v1';
export const CRM_XLSX_FILE='CRM_CONTACTOS_v1.xlsx';
export const CRM_XLSX_SHEET='CONTACTOS_CRM';
export const CRM_XLSX_HEADERS=['DNI','Nombre','Apellido','Teléfono','Estado','Actividad','Fecha de inscripción','Fecha de vencimiento'] as const;
export type CrmXlsxStatus='al_dia'|'nuevo_inscripto'|'adeudando'|'abandonado';
export type CrmXlsxRow={sourceRow:number;document:string;contactKey:string;firstName:string;lastName:string;phone:string;status:CrmXlsxStatus;activity:string|null;enrollmentDate:string|null;dueDate:string|null};
export type CrmXlsxIssue={row:number;field:string;message:string};
export type CrmXlsxValidation={sha256:string;rows:CrmXlsxRow[];issues:CrmXlsxIssue[]};
const letters=['A','B','C','D','E','F','G','H'];
const statusMap:Record<string,CrmXlsxStatus>={al_dia:'al_dia',nuevo_inscripto:'nuevo_inscripto',adeudando:'adeudando',abandonado:'abandonado'};
const normalized=(value:string)=>value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'_');
const text=(value:string)=>value.trim().normalize('NFC').replace(/\s+/g,' ');
const problem=(row:number,field:string,message:string):CrmXlsxIssue=>({row,field,message});

export function validateCrmXlsx(buffer:Buffer,filename:string,mime:string):CrmXlsxValidation {
  const sha256=createHash('sha256').update(buffer).digest('hex');
  const issues:CrmXlsxIssue[]=[];const rows:CrmXlsxRow[]=[];
  if(!/\.xlsx$/i.test(filename))issues.push(problem(0,'archivo','Se requiere un archivo .xlsx sin macros.'));
  if(![XLSX_POLICY.mime,'application/octet-stream'].includes(mime))issues.push(problem(0,'archivo','Tipo de archivo XLSX inválido.'));
  if(buffer.length>XLSX_POLICY.maxCompressedBytes)issues.push(problem(0,'archivo','El archivo supera 8 MiB.'));
  if(issues.length)return {sha256,rows,issues};
  try {
    const entries=inspectZip(buffer);
    if(entries.some(e=>/vbaproject\.bin|\.xlsm$|externallinks\//i.test(e.name)))return {sha256,rows,issues:[problem(0,'archivo','No se permiten macros ni enlaces externos.')]};
    const file=(name:string)=>entries.find(e=>e.name===name);
    const workbook=file('xl/workbook.xml'),relationships=file('xl/_rels/workbook.xml.rels'),contentTypes=file('[Content_Types].xml');
    if(!workbook||!relationships||!contentTypes)return {sha256,rows,issues:[problem(0,'archivo','Estructura XLSX incompleta.')]};
    const typesXml=readWorkbookEntry(buffer,contentTypes);
    const workbookOverride=[...typesXml.matchAll(/<Override\b[^>]*>/gi)].map(match=>match[0]).find(tag=>/\bPartName="\/xl\/workbook\.xml"/i.test(tag));
    const workbookMime=workbookOverride?.match(/\bContentType="([^"]+)"/i)?.[1];
    if(workbookMime!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')return {sha256,rows,issues:[problem(0,'archivo','El libro no es un XLSX estándar sin macros. Descargá nuevamente la plantilla.')]};
    const sheets=workbookSheetEntries(readWorkbookEntry(buffer,workbook),readWorkbookEntry(buffer,relationships),entries);
    if(sheets.length!==1||sheets[0].name!==CRM_XLSX_SHEET||!sheets[0].entry)return {sha256,rows,issues:[problem(0,'hoja',`Se requiere solo la hoja ${CRM_XLSX_SHEET}.`)]};
    const xml=readWorkbookEntry(buffer,sheets[0].entry);
    if(/<(?:[A-Za-z0-9_]+:)?f(?:\s|>)/i.test(xml))return {sha256,rows,issues:[problem(0,'archivo','No se permiten fórmulas.')]};
    const shared=file('xl/sharedStrings.xml');const strings=sharedStringTable(shared?readWorkbookEntry(buffer,shared):'');
    const xmlRows=[...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
    const header=workbookCells(xmlRows.find(r=>Number(r[1])===1)?.[2]??'',strings);
    CRM_XLSX_HEADERS.forEach((name,index)=>{if(header.get(`${letters[index]}1`)!==name)issues.push(problem(1,name,`Se esperaba «${name}» en ${letters[index]}1.`));});
    const marker=workbookCells(xmlRows.find(r=>Number(r[1])===14)?.[2]??'',strings).get('K14');
    if(marker!=='CRM_CONTACTOS_v1')issues.push(problem(14,'versión','La plantilla no corresponde a CRM_CONTACTOS_v1.xlsx. Descargá la versión actual.'));
    if(issues.length)return {sha256,rows,issues};
    const populated=xmlRows.filter(r=>Number(r[1])>1&&letters.some(letter=>text(workbookCells(r[2],strings).get(`${letter}${r[1]}`)??'')!==''));
    if(populated.length===0)issues.push(problem(0,'archivo','La hoja no contiene contactos.'));
    if(populated.length>XLSX_POLICY.maxRowsPerSheet)issues.push(problem(0,'archivo','La hoja excede 10.000 filas.'));
    if(issues.length)return {sha256,rows,issues};
    const seen=new Set<string>();
    for(const raw of populated){
      const sourceRow=Number(raw[1]),cells=workbookCells(raw[2],strings);
      const value=(index:number)=>text(cells.get(`${letters[index]}${sourceRow}`)??'');
      const document=value(0).replace(/[.\s-]/g,'');const firstName=value(1),lastName=value(2),phoneRaw=value(3),statusRaw=value(4),activity=value(5);
      const status=statusMap[normalized(statusRaw)];
      const phone=normalizeArPhone(phoneRaw);
      const enrolled=value(6),due=value(7),enrollmentDate=enrolled?parseWorkbookDate(enrolled):null,dueDate=due?parseWorkbookDate(due):null;
      if(!/^\d{7,9}$/.test(document))issues.push(problem(sourceRow,'DNI','DNI inválido; usá entre 7 y 9 dígitos.'));
      if(!firstName||firstName.length>120)issues.push(problem(sourceRow,'Nombre','Nombre obligatorio de hasta 120 caracteres.'));
      if(!lastName||lastName.length>120)issues.push(problem(sourceRow,'Apellido','Apellido obligatorio de hasta 120 caracteres.'));
      if(!/^549\d{10}$/.test(phone))issues.push(problem(sourceRow,'Teléfono','Teléfono argentino válido obligatorio.'));
      if(!status)issues.push(problem(sourceRow,'Estado','Estado inválido: Al día, Adeudando, Nuevo Inscripto o Abandonado.'));
      if(!activity)issues.push(problem(sourceRow,'Actividad','Actividad obligatoria para este estado.'));
      if(activity.length>160)issues.push(problem(sourceRow,'Actividad','Actividad demasiado larga.'));
      if(enrolled&&!enrollmentDate)issues.push(problem(sourceRow,'Fecha de inscripción','Usá una fecha Excel o AAAA-MM-DD.'));
      if(due&&!dueDate)issues.push(problem(sourceRow,'Fecha de vencimiento','Usá una fecha Excel o AAAA-MM-DD.'));
      const contactKey=`${document}:${activity?normalized(activity):'_sin_actividad'}`;
      if(seen.has(contactKey))issues.push(problem(sourceRow,'DNI/Actividad','Contacto repetido para el mismo DNI y actividad.'));
      seen.add(contactKey);
      if(status&&/^\d{7,9}$/.test(document))rows.push({sourceRow,document,contactKey,firstName,lastName,phone,status,activity:activity||null,enrollmentDate,dueDate});
    }
  }catch(error){issues.push(problem(0,'archivo',error instanceof Error?error.message:'XLSX inválido.'));}
  return {sha256,rows,issues};
}
