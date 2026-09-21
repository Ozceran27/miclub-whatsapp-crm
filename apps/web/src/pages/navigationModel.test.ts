import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSectorModules, CORE_ORDER } from './navigationModel';

test('orders core navigation and keeps system sectors out of the sector menu', () => {
  assert.deepEqual(CORE_ORDER, ['home', 'administration', 'economy', 'crm', 'dataMigration']);

  assert.deepEqual(buildSectorModules([
    { id: 'custom', name: 'Fitness', code: 'fitness' },
    { id: 'treasury', name: 'Tesorería', code: 'tesoreria' },
    { id: 'common', name: 'Áreas Comunes', code: 'areas_comunes' },
    { id: 'admin', name: 'Administración', code: 'administracion' },
    { id: 'user-created', name: 'Ajedrez', code: null },
  ]), [
    { id: 'sector:user-created', label: 'AJEDREZ' },
    { id: 'sector:common', label: 'ÁREAS COMUNES' },
    { id: 'sector:custom', label: 'FITNESS' },
  ]);
});
