import test from 'node:test';
import assert from 'node:assert/strict';
import type { PgPool } from '../db/postgres.js';
import { setPostgresPoolForTests } from '../db/postgres.js';
import { getHistory, updateTemplate } from './crmRepository.js';

void test('editar una plantilla ausente no inserta otra ni cambia el club', async () => {
  const queries: string[] = [];
  const query = (sql: string) => {
    queries.push(sql);
    if (sql.includes('to_regclass')) return Promise.resolve({ rows: [{ ready: true }] });
    return Promise.resolve({ rows: [] });
  };
  const pool = { query, connect: () => Promise.resolve({ query, release: () => undefined }) } as unknown as PgPool;
  setPostgresPoolForTests(pool);
  try {
    const result = await updateTemplate('11111111-1111-4111-8111-111111111111', 'missing', 'Nombre', 'Cuerpo', new Date().toISOString());
    assert.equal(result, null);
    assert.ok(queries.some(sql => sql.includes('where club_id=$1 and id=$2 and archived_at is null')));
    assert.ok(queries.every(sql => !sql.includes('insert into miclub.crm_message_templates')));
  } finally {
    setPostgresPoolForTests(undefined);
  }
});

void test('historial ordena por actividad antes de paginar y conserva alcance de sector',async()=>{
  const queries:Array<{sql:string;params?:unknown[]}>=[];
  const query=(sql:string,params?:unknown[])=>{queries.push({sql,params});
    if(sql.includes('to_regclass'))return Promise.resolve({rows:[{ready:true}]});
    if(sql.includes('count(*) as total'))return Promise.resolve({rows:[{total:'0'}]});
    return Promise.resolve({rows:[]});};
  const pool={query,connect:()=>Promise.resolve({query,release:()=>undefined})} as unknown as PgPool;
  setPostgresPoolForTests(pool);
  try{await getHistory('11111111-1111-4111-8111-111111111111',2,20,['22222222-2222-4222-8222-222222222222'],'activity','desc');
    const list=queries.find(call=>call.sql.includes('limit $3 offset $4'));
    assert.ok(list);assert.match(list.sql,/order by a.name desc nulls last,h.id limit \$3 offset \$4/);
    assert.match(list.sql,/a.sector_id=any\(\$2\)/);assert.deepEqual(list.params?.slice(-2),[20,20]);
  }finally{setPostgresPoolForTests(undefined);}
});
