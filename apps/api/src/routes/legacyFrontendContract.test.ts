import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source=(relativePath:string)=>fs.readFileSync(path.resolve(import.meta.dirname,relativePath),'utf8');

void test('Inicio conserva rutas raíz y CRM usa /api/crm sin depender de hojas',()=>{
  const home=source('../../../web/src/services/api/homeApi.ts');
  const crm=source('../../../web/src/services/api/crmApi.ts');
  const legacy=source('legacyCompatRoutes.ts');
  const routes=source('crmRoutes.ts');
  const index=source('../index.ts');
  for(const route of ['/summary','/members','/debtors','/club-finance-summary','/sector-operational-summary']){
    assert.ok(home.includes(route));assert.ok(legacy.includes(`"${route}"`));
  }
  assert.ok(index.includes('app.use("/api/crm", createCrmRoutes())'));
  for(const route of ['/debts','/debt-summary','/catalog','/prepared','/templates','/history']){
    assert.ok(crm.includes(route));assert.ok(routes.includes(`"${route}"`)||routes.includes(`"${route}/`));
  }
  assert.doesNotMatch(crm,/sync-status|sourceSheet|\/members|\/debtors/);
});
