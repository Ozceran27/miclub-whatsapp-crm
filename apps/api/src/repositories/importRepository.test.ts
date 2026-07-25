import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImportConflictTargets } from './importRepository.js';

test('preflight acepta índices parciales tenant-scoped de ambas entidades', async () => {
  const pool = { query: async () => ({ rows: [
    { table_name: 'enrollments', compatible: true },
    { table_name: 'movements', compatible: true },
  ] }) };
  const details = await inspectImportConflictTargets(pool as never);
  assert.equal(details.every((item) => item.compatibleConstraintFound), true);
  assert.deepEqual(details[0]?.requiredConflictTarget, ['club_id', 'external_id']);
  assert.equal(details[0]?.requiredPredicate, 'external_id IS NOT NULL');
});

test('preflight informa exactamente el target faltante sin crear errores por fila', async () => {
  const pool = { query: async () => ({ rows: [
    { table_name: 'enrollments', compatible: true },
    { table_name: 'movements', compatible: false },
  ] }) };
  const details = await inspectImportConflictTargets(pool as never);
  assert.deepEqual(details.filter((item) => !item.compatibleConstraintFound).map((item) => item.entity), ['movements']);
});
