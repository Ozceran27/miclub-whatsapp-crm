import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PreparedMessage } from '@miclub/shared';
import { MessageTemplatePanel } from './MessageTemplatePanel';
import { PreparedMessagesPanel } from './PreparedMessagesPanel';
import { nextCrmSort, SortableHeader } from './SortableHeader';

void test('mensajes preparados conservan la plantilla y ocultan su cuerpo en la tarjeta',()=>{
  const item={historyId:1,memberId:'1',nombre:'Ana Pérez',phone:'5493764123456',actividad:'Tenis',message:'Texto confidencial del mensaje completo',templateName:'Aviso de deuda',status:'prepared'} as PreparedMessage;
  const html=renderToStaticMarkup(createElement(PreparedMessagesPanel,{prepared:[item],page:1,total:1,loadPage:()=>Promise.resolve(),canWrite:true,
    openWhatsApp:()=>Promise.resolve(),updatePreparedStatus:()=>Promise.resolve()}));
  assert.match(html,/Ana Pérez/);assert.match(html,/Tenis/);assert.match(html,/5493764123456/);assert.match(html,/Aviso de deuda/);
  assert.doesNotMatch(html,/Texto confidencial del mensaje completo/);
});

void test('editor conserva acciones permitidas y no ofrece restauración',()=>{
  const action=()=>Promise.resolve();const html=renderToStaticMarkup(createElement(MessageTemplatePanel,{templates:[],selectedTemplateId:'',handleTemplateChange:()=>undefined,
    templateName:'',setTemplateName:()=>undefined,message:'',setMessage:()=>undefined,templateStatus:'idle',setTemplateStatus:()=>undefined,
    saveTemplate:action,createTemplate:action,duplicateTemplate:action,deleteTemplate:action,preview:'Vista',canPrepare:false,prepare:action,preparing:false}));
  assert.match(html,/crm-composer-grid/);assert.match(html,/Guardar cambios/);assert.match(html,/Crear plantilla/);
  assert.match(html,/Duplicar plantilla/);assert.doesNotMatch(html,/Eliminar plantilla/);assert.doesNotMatch(html,/Restaurar plantillas/);
});

void test('encabezados alternan dirección y anuncian el orden activo',()=>{
  const asc=nextCrmSort(null,'name');const desc=nextCrmSort(asc,'name');
  assert.deepEqual(desc,{by:'name',direction:'desc'});
  const html=renderToStaticMarkup(createElement('table',null,createElement('thead',null,createElement('tr',null,
    createElement(SortableHeader,{label:'Nombre',field:'name',sort:desc,onSort:()=>undefined})))));
  assert.match(html,/aria-sort="descending"/);assert.match(html,/Nombre/);
});
