import test from 'node:test';
import assert from 'node:assert/strict';
import { crmApi } from './crmApi';

void test('CRM consulta deudas paginadas en /api/crm y conserva filtros tenant-safe del servidor',async()=>{
  const old=globalThis.fetch;
  const urls:string[]=[];
  globalThis.fetch=(input)=>{urls.push(input instanceof Request?input.url:input instanceof URL?input.href:input);return Promise.resolve(new Response(JSON.stringify({items:[],page:2,pageSize:20,total:0}),{status:200,headers:{'content-type':'application/json'}}));};
  try{
    await crmApi.debts({kind:'review',page:2,query:'Ana Pérez',sectorId:'11111111-1111-4111-8111-111111111111',activityId:''});
    assert.equal(urls.length,1);
    const url=new URL(urls[0],'http://localhost');
    assert.equal(url.pathname,'/api/crm/debts');
    assert.equal(url.searchParams.get('kind'),'review');
    assert.equal(url.searchParams.get('page'),'2');
    assert.equal(url.searchParams.get('query'),'Ana Pérez');
    assert.equal(url.searchParams.get('sectorId'),'11111111-1111-4111-8111-111111111111');
    assert.equal(url.searchParams.has('clubId'),false);
  }finally{globalThis.fetch=old;}
});
