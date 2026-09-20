import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

void test('los accesos rápidos de configuración ejecutan los modales reales', () => {
  const actions = read('./AdministrationActions.tsx');
  const module = read('../AdministrationModule.tsx');

  for (const operation of ['sector', 'worker', 'activity']) {
    assert.match(actions, new RegExp(`operation: '${operation}'`));
  }
  assert.match(actions, /configuredOperation\.run\(\)/);
  assert.match(module, /onCreateSector=\{\(\)=>window\.dispatchEvent\(new Event\('miclub:create-sector'\)\)\}/);
  assert.match(module, /onCreateWorker=\{\(\)=>window\.dispatchEvent\(new Event\('miclub:create-worker'\)\)\}/);
  assert.match(module, /onCreateActivity=\{\(\)=>window\.dispatchEvent\(new Event\('miclub:create-activity'\)\)\}/);

  assert.match(read('./SectorList.tsx'), /addEventListener\('miclub:create-sector'/);
  assert.match(read('./WorkerList.tsx'), /addEventListener\('miclub:create-worker'/);
  assert.match(read('./ActivityList.tsx'), /addEventListener\('miclub:create-activity'/);
});
