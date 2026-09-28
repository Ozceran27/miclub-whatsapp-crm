import test from 'node:test';
import assert from 'node:assert/strict';
import type { QueryExecutor } from '../db/postgres.js';
import { getCrmDebtSummary, listCrmDebts } from './crmDebtRepository.js';

const club='11111111-1111-4111-8111-111111111111';
const sector='22222222-2222-4222-8222-222222222222';
void test('listado y resumen limitan club y sectores antes de agregar deuda',async()=>{
  const calls:Array<{sql:string;params?:unknown[]}>=[];
  const db:QueryExecutor={query:<T>(sql:string,params?:unknown[])=>{
    calls.push({sql,params});
    if(sql.includes('count(*)::int total from classified'))return Promise.resolve({rows:[{total:0}] as T[]});
    if(sql.includes('"totalEnrollments"'))return Promise.resolve({rows:[{totalEnrollments:0,overdueEnrollments:0,reviewEnrollments:0,overdueInstallments:0,balances:[]} as T]});
    return Promise.resolve({rows:[] as T[]});
  }};
  await listCrmDebts(db,club,[sector],{kind:'overdue',page:1,pageSize:20});
  await getCrmDebtSummary(db,club,[sector]);
  assert.equal(calls.length,3);
  for(const call of calls){
    assert.equal(call.params?.[0],club);
    assert.deepEqual(call.params?.[1],[sector]);
    assert.match(call.sql,/r\.club_id=\$1/);
    assert.match(call.sql,/e\.club_id=\$1/);
    assert.match(call.sql,/s\.id=any\(\$2\)/);
    assert.match(call.sql,/f\.due_date<d\.today and f\.balance>0/);
    assert.match(call.sql,/r\.amount-r\.cancelled_amount-coalesce\(sum\(pa\.amount\),0\)/);
  }
});
