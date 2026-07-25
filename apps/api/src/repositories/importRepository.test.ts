import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImportConflictTargets } from './importRepository.js';

test('preflight acepta todos los índices usados por el importador', async () => {
  const pool = { query: async () => ({ rows: [
    { table_name: 'enrollments', target: ['club_id', 'external_id'], predicate: 'external_id IS NOT NULL', compatible: true },
    { table_name: 'movements', target: ['club_id', 'external_id'], predicate: 'external_id IS NOT NULL', compatible: true },
    { table_name: 'operational_balances', target: ['club_id', 'source', 'cutoff_date'], predicate: null, compatible: true },
  ] }) };
  const details = await inspectImportConflictTargets(pool as never);
  assert.equal(details.every((item) => item.compatibleConstraintFound), true);
  assert.deepEqual(details[0]?.requiredConflictTarget, ['club_id', 'external_id']);
  assert.equal(details[0]?.requiredPredicate, 'external_id IS NOT NULL');
});

test('preflight informa exactamente el target faltante sin crear errores por fila', async () => {
  const pool = { query: async () => ({ rows: [
    { table_name: 'enrollments', target: ['club_id', 'external_id'], predicate: 'external_id IS NOT NULL', compatible: true },
    { table_name: 'operational_balances', target: ['club_id', 'source', 'cutoff_date'], predicate: null, compatible: false },
  ] }) };
  const details = await inspectImportConflictTargets(pool as never);
  assert.deepEqual(details.filter((item) => !item.compatibleConstraintFound).map((item) => item.entity), ['operational_balances']);
});
