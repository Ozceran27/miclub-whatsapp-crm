import test from 'node:test';
import assert from 'node:assert/strict';
import { crmXlsxApi } from './crmXlsxApi';

void test('historial XLSX pide solo enviados con página y orden, sin autoridad tenant del cliente',async()=>{
  const original=globalThis.fetch;const urls:string[]=[];
  globalThis.fetch=(input)=>{urls.push(input instanceof Request?input.url:input instanceof URL?input.href:input);
    return Promise.resolve(new Response(JSON.stringify({items:[],total:0,page:2,pageSize:20}),{status:200,headers:{'content-type':'application/json'}}));};
  try{await crmXlsxApi.messages(2,false,'date','asc','sent_manual');
    const url=new URL(urls[0],'http://localhost');
    assert.equal(url.pathname,'/api/crm/xlsx/messages');
    assert.equal(url.searchParams.get('status'),'sent_manual');
    assert.equal(url.searchParams.get('page'),'2');
    assert.equal(url.searchParams.get('sortBy'),'date');
    assert.equal(url.searchParams.get('sortDirection'),'asc');
    assert.equal(url.searchParams.has('clubId'),false);
  }finally{globalThis.fetch=original;}
});
