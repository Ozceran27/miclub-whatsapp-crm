import test from 'node:test';
import assert from 'node:assert/strict';
import { compensationDueDates } from './employeeCompensationService.js';

test('remuneraciones generan vencimientos diarios y semanales anclados a la vigencia', () => {
  assert.deepEqual(compensationDueDates('2026-09-29','2026-10-02','DAILY'),['2026-09-29','2026-09-30','2026-10-01','2026-10-02']);
  assert.deepEqual(compensationDueDates('2026-09-29','2026-10-20','WEEKLY'),['2026-09-29','2026-10-06','2026-10-13','2026-10-20']);
});

test('remuneraciones mensuales vencen al cierre y las anuales respetan el aniversario', () => {
  assert.deepEqual(compensationDueDates('2026-09-15','2026-11-30','MONTHLY'),['2026-09-30','2026-10-31','2026-11-30']);
  assert.deepEqual(compensationDueDates('2024-02-29','2027-03-01','YEARLY'),['2024-02-29','2025-02-28','2026-02-28','2027-02-28']);
});

test('remuneraciones rechazan vigencias y frecuencias inválidas', () => {
  assert.throws(()=>compensationDueDates('2026-10-01','2026-09-01','MONTHLY'),/Vigencia/);
  assert.throws(()=>compensationDueDates('2026-09-01','2026-10-01','QUARTERLY'),/frecuencia/);
});
