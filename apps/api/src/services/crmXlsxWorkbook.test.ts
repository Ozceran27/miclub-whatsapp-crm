import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { zip } from './xlsxMigration/fixtures/workbookFixtures.js';
import { inspectZip, readEntry } from './xlsxMigration/zipInspector.js';
import { CRM_XLSX_HEADERS, validateCrmXlsx } from './crmXlsxWorkbook.js';

const xml=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const cell=(address:string,value:string)=>`<c r="${address}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
const fixture=(rows:string[][],header=CRM_XLSX_HEADERS as readonly string[],workbookMime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',marker='CRM_CONTACTOS_v1')=>zip({
  '[Content_Types].xml':`<Types><Override PartName="/xl/workbook.xml" ContentType="${workbookMime}"/></Types>`,
  'xl/workbook.xml':'<workbook xmlns:r="r"><sheets><sheet name="CONTACTOS_CRM" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':`<worksheet><sheetData><row r="1">${header.map((v,i)=>cell(`${'ABCDEFGH'[i]}1`,v)).join('')}</row>${rows.map((values,index)=>`<row r="${index+2}">${values.map((v,i)=>v?cell(`${'ABCDEFGH'[i]}${index+2}`,v):'').join('')}</row>`).join('')}<row r="14">${cell('K14',marker)}</row></sheetData></worksheet>`,
});
const valid=(buffer:Buffer)=>validateCrmXlsx(buffer,'CRM_CONTACTOS_v1.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

void test('la plantilla distribuida se reconoce y no importa ejemplos de la guía',()=>{
  const result=valid(readFileSync(new URL('../../data/db/CRM_CONTACTOS_v1.xlsx',import.meta.url)));
  assert.equal(result.rows.length,0);
  assert.deepEqual(result.issues.map(i=>i.message),['La hoja no contiene contactos.']);
});
void test('la plantilla real editada y renombrada se puede volver a validar',()=>{
  const downloaded=readFileSync(new URL('../../data/db/CRM_CONTACTOS_v1.xlsx',import.meta.url));
  const files=Object.fromEntries(inspectZip(downloaded).map(entry=>[entry.name,readEntry(downloaded,entry)]));
  const editedRow=`<row r="2">${['12345678','Ana','Pérez','3764123456','Nuevo Inscripto','Tenis','',''].map((value,index)=>value?cell(`${'ABCDEFGH'[index]}2`,value):'').join('')}</row>`;
  files['xl/worksheets/sheet1.xml']=files['xl/worksheets/sheet1.xml'].replace(/<row r="2"[^>]*>[\s\S]*?<\/row>/,editedRow);
  const result=validateCrmXlsx(zip(files),'mis_contactos.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(result.issues,[]);
  assert.equal(result.rows[0].status,'nuevo_inscripto');
});
void test('lee cuatro estados y conserva fechas declaradas sin montos',()=>{
  const result=valid(fixture([
    ['12.345.678','Ana','Pérez','3764123456','Adeudando','Tenis','2026-01-01','2026-02-01'],
    ['12345679','Beto','Gómez','3764123457','Al día','Fútbol','',''],
    ['12345680','Caro','López','3764123458','Nuevo Inscripto','Natación','',''],
    ['12345681','Dani','Ruiz','3764123459','Abandonado','Yoga','',''],
  ]));
  assert.deepEqual(result.issues,[]);assert.equal(result.rows.length,4);
  assert.equal(result.rows[0].document,'12345678');assert.equal(result.rows[0].dueDate,'2026-02-01');
  assert.equal(result.rows[2].status,'nuevo_inscripto');
});
void test('rechaza duplicado, fecha, estado, teléfono y estructura insegura',()=>{
  const row=['12345678','Ana','Pérez','3764123456','Adeudando','Tenis','',''];
  const duplicate=valid(fixture([row,[...row]]));assert.ok(duplicate.issues.some(i=>i.field==='DNI/Actividad'));
  const bad=valid(fixture([['12345678','Ana','Pérez','abc','Otro','','','2026-02-30']]));
  assert.deepEqual(new Set(bad.issues.map(i=>i.field)),new Set(['Teléfono','Estado','Actividad','Fecha de vencimiento']));
  assert.ok(valid(fixture([['12345678','Ana','Pérez','3764123456','No inscripto','Tenis','','']])).issues.some(i=>i.field==='Estado'));
  assert.ok(valid(fixture([['12345678','Ana','Pérez','3764123456','Nuevo Inscripto','','','']])).issues.some(i=>i.field==='Actividad'));
  assert.ok(valid(fixture([row],CRM_XLSX_HEADERS,'application/vnd.ms-excel.sheet.macroEnabled.main+xml')).issues.some(i=>i.message.includes('XLSX estándar')));
  assert.ok(valid(fixture([row],CRM_XLSX_HEADERS,undefined,'CRM_CONTACTOS_v2')).issues.some(i=>i.field==='versión'));
  assert.ok(valid(zip({'../xl/workbook.xml':'bad'})).issues.length>0);
  assert.ok(valid(fixture([row],['Otro',...CRM_XLSX_HEADERS.slice(1)])).issues.some(i=>i.row===1));
});
