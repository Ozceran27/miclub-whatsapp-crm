import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaginatedList } from './PaginatedList';

for (const state of ['loading','error','empty'] as const) {
  void test(`las acciones de una lista permanecen disponibles en estado ${state}`,()=>{
    const html=renderToStaticMarkup(createElement(PaginatedList,{
      id:'test-list',eyebrow:'Prueba',title:'Listado',description:'Descripción',searchLabel:'Buscar',search:'',status:'',statusLabel:'Estado',statusOptions:[],
      loading:state==='loading',error:state==='error'?'Error al cargar':null,total:0,page:1,pageSize:20,
      actions:createElement('button',{type:'button'},'Acción disponible'),emptyMessage:'Sin registros',
      onSearchChange:()=>undefined,onStatusChange:()=>undefined,onFilter:()=>undefined,onPageChange:()=>undefined,onRetry:()=>undefined,
    },createElement('table',null)));
    assert.match(html,/Acción disponible/);
    assert.match(html,/id="test-list-title" tabindex="-1"/);
    assert.doesNotMatch(html,/<table/);
  });
}
