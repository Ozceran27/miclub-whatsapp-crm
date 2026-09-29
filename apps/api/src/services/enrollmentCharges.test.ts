import assert from 'node:assert/strict';
import test from 'node:test';
import { feeCyclesInMonth, feeDueDate } from './enrollmentCharges.js';

void test('la cuota mensual conserva el día ancla al atravesar febrero',()=>{
  assert.deepEqual([0,1,2,3].map(n=>feeDueDate('2026-01-31','MONTHLY',n)),
    ['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  assert.deepEqual(feeCyclesInMonth('2026-01-31','MONTHLY','2026-02'),
    [{dueDate:'2026-02-28',nextDueDate:'2026-03-31'}]);
});
void test('la cuota anual vuelve al 29 de febrero en año bisiesto',()=>{
  assert.deepEqual([0,1,2,3,4].map(n=>feeDueDate('2024-02-29','YEARLY',n)),
    ['2024-02-29','2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
});
void test('cuotas diarias y semanales producen todos los vencimientos del mes',()=>{
  assert.equal(feeCyclesInMonth('2026-09-27','DAILY','2026-09').length,4);
  assert.deepEqual(feeCyclesInMonth('2026-09-01','WEEKLY','2026-09').map(c=>c.dueDate),
    ['2026-09-01','2026-09-08','2026-09-15','2026-09-22','2026-09-29']);
});
