import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMonthlySettlements, proposeResponsibleCompensations, type MonthlyActivityTerm } from './activitySettlementService.js';

const term = (patch: Partial<MonthlyActivityTerm> = {}): MonthlyActivityTerm => ({
  id: 'ana-arte', activityId: 'arte', sectorId: 'salon', personId: 'ana',
  currencyCode: 'ARS', mode: 'VARIABLE', clubSharePercentage: 40,
  effectiveFrom: '2026-01-01', ...patch,
});
const input = () => ({
  month: '2026-09', timeZone: 'America/Argentina/Buenos_Aires', terms: [term()],
  collections: [{ id: 'c1', activityId: 'arte', currencyCode: 'ARS', occurredAt: '2026-09-03', amount: 100000, status: 'COMPLETADO' }],
  payments: [{ id: 'p1', termId: 'ana-arte', month: '2026-09', amount: 20000, kind: 'PAYMENT' as const, status: 'COMPLETADO' }],
  refunds: [],
});

void test('mensual VARIABLE conserva ejemplo 40000 y pago al corregir ingreso', () => {
  const data = input();
  assert.equal(calculateMonthlySettlements(data)[0].balance, 40000);
  data.payments[0].amount = 60000;
  data.collections[0].amount = 80000;
  const row = calculateMonthlySettlements(data)[0];
  assert.equal(row.balance, -12000);
  assert.equal(row.payments, 60000);
  assert.equal(row.paymentState, 'DEBT');
});

void test('FIXED conserva saldo 320000 y déficit 25000', () => {
  const data = input();
  data.terms = [term({ mode: 'FIXED', clubSharePercentage: null, fixedClubFee: 150000, fixedFeeFrequency: 'MONTHLY', partialMonthPolicy: 'FULL_MONTH' })];
  data.collections[0].amount = 500000;
  data.payments[0].amount = 30000;
  assert.equal(calculateMonthlySettlements(data)[0].balance, 320000);
  data.terms[0].fixedClubFee = 85000;
  data.collections[0].amount = 60000;
  data.payments = [];
  assert.equal(calculateMonthlySettlements(data)[0].balance, -25000);
});

void test('cuota atrasada corresponde al nuevo responsable y devolución al original', () => {
  const data = input();
  data.terms = [term({ effectiveTo: '2026-08-31' }), term({ id: 'bruno-arte', personId: 'bruno', effectiveFrom: '2026-09-01' })];
  data.payments = [];
  data.collections.push({ ...data.collections[0], id: 'agosto', occurredAt: '2026-08-20' });
  const rows = calculateMonthlySettlements({ ...data, refunds: [{ id: 'r1', collectionId: 'agosto', originalTermId: 'ana-arte', originalResponsibleAmount: 12000, amount: 20000, occurredAt: '2026-09-05', status: 'COMPLETADO' }] });
  assert.equal(rows.find(row => row.personId === 'ana')?.balance, -12000);
  assert.equal(rows.find(row => row.personId === 'bruno')?.balance, 60000);
});

void test('FIXED devolución no reduce el fijo y limita devoluciones acumuladas', () => {
  const data = input();
  data.payments = [];
  data.terms = [term({ mode: 'FIXED', clubSharePercentage: null, fixedClubFee: 85000, fixedFeeFrequency: 'MONTHLY', partialMonthPolicy: 'FULL_MONTH' })];
  const refund = { id: 'r1', collectionId: 'c1', originalTermId: 'ana-arte', originalResponsibleAmount: 20000, amount: 20000, occurredAt: '2026-09-05', status: 'COMPLETADO' };
  const row = calculateMonthlySettlements({ ...data, refunds: [refund] })[0];
  assert.equal(row.fixedClubFee, 85000);
  assert.equal(row.balance, -5000);
  assert.throws(() => calculateMonthlySettlements({ ...data, refunds: [refund, { ...refund, id: 'r2', amount: 90000, originalResponsibleAmount: 90000 }] }), /exceeds/);
});

void test('mes completo exige distribución única al cambiar de responsable', () => {
  const data = input();
  const fixed = term({ mode: 'FIXED', clubSharePercentage: null, fixedClubFee: 85000, fixedFeeFrequency: 'MONTHLY', partialMonthPolicy: 'FULL_MONTH', effectiveTo: '2026-09-15' });
  data.terms = [fixed, { ...fixed, id: 'bruno-arte', personId: 'bruno', effectiveFrom: '2026-09-16', effectiveTo: null }];
  assert.throws(() => calculateMonthlySettlements(data), /explicit distribution/);
  const rows = calculateMonthlySettlements({ ...data, fullMonthFeeAllocations: [{ termId: fixed.id, amount: 40000 }, { termId: 'bruno-arte', amount: 45000 }] });
  assert.equal(rows.reduce((sum, row) => sum + row.fixedClubFee, 0), 85000);
  assert.throws(() => calculateMonthlySettlements({ ...data, fullMonthFeeAllocations: [{ termId: fixed.id, amount: 85000 }, { termId: 'bruno-arte', amount: 85000 }] }), /one monthly fee/);
});

void test('prorrateo por vigencia usa días calendario; frecuencia sin revisar bloquea', () => {
  const data = input();
  data.collections = [];
  data.payments = [];
  data.terms = [term({ mode: 'FIXED', clubSharePercentage: null, fixedClubFee: 90000, fixedFeeFrequency: 'MONTHLY', partialMonthPolicy: 'CALENDAR_DAYS', effectiveFrom: '2026-09-16' })];
  assert.equal(calculateMonthlySettlements(data)[0].fixedClubFee, 45000);
  data.terms[0].fixedFeeFrequency = 'WEEKLY';
  assert.throws(() => calculateMonthlySettlements(data), /Nonmonthly/);
});

void test('no mezcla personas ni monedas; compensa deuda antigua antes que reciente', () => {
  const result = proposeResponsibleCompensations([
    { id: 'yoga', personId: 'ana', currencyCode: 'ARS', month: '2026-08', balance: -12000 },
    { id: 'arte', personId: 'ana', currencyCode: 'ARS', month: '2026-09', balance: 30000 },
    { id: 'usd', personId: 'ana', currencyCode: 'USD', month: '2026-07', balance: -500 },
    { id: 'bruno', personId: 'bruno', currencyCode: 'ARS', month: '2026-07', balance: -5000 },
  ]);
  assert.equal(result.compensations.length, 1);
  assert.equal(result.remaining.find(row => row.id === 'arte')?.balance, 18000);
  assert.equal(result.remaining.find(row => row.id === 'usd')?.balance, -500);
  assert.equal(result.remaining.find(row => row.id === 'bruno')?.balance, -5000);
});

void test('rechaza IDs duplicados, importes inválidos, referencias faltantes y fechas irreales', () => {
  const data = input();
  assert.throws(() => calculateMonthlySettlements({ ...data, collections: [...data.collections, ...data.collections] }), /Duplicate/);
  assert.throws(() => calculateMonthlySettlements({ ...data, month: '2026-13' }), /calendar/);
  data.collections[0].amount = NaN;
  assert.throws(() => calculateMonthlySettlements(data), /monetary/);
  data.collections[0].amount = 100000;
  data.payments[0].termId = 'otro-club';
  assert.throws(() => calculateMonthlySettlements(data), /recipient/);
});

void test('usa la zona del club en el límite de mes', () => {
  const data = input();
  data.collections[0].occurredAt = '2026-09-01T01:00:00Z';
  data.payments = [];
  assert.equal(calculateMonthlySettlements(data)[0].income, 0);
  assert.equal(calculateMonthlySettlements({ ...data, timeZone: 'UTC' })[0].income, 100000);
});

void test('prorrateo distribuye el centavo residual sin duplicarlo', () => {
  const data = input();
  data.collections = [];
  data.payments = [];
  const fixed = term({ mode: 'FIXED', clubSharePercentage: null, fixedClubFee: 0.01,
    fixedFeeFrequency: 'MONTHLY', partialMonthPolicy: 'CALENDAR_DAYS', effectiveTo: '2026-09-15' });
  data.terms = [fixed, { ...fixed, id: 'bruno-arte', personId: 'bruno', effectiveFrom: '2026-09-16', effectiveTo: null }];
  assert.equal(calculateMonthlySettlements(data).reduce((sum, row) => sum + row.fixedClubFee, 0), 0.01);
});

void test('devolución no puede atribuirse a un término posterior al cobro', () => {
  const data = input();
  data.terms = [term({ effectiveTo: '2026-09-15' }), term({ id: 'bruno-arte', personId: 'bruno', effectiveFrom: '2026-09-16' })];
  assert.throws(() => calculateMonthlySettlements({ ...data, refunds: [{ id: 'r1', collectionId: 'c1',
    originalTermId: 'bruno-arte', originalResponsibleAmount: 6000, amount: 10000,
    occurredAt: '2026-09-20', status: 'COMPLETADO' }] }), /original collection agreement/);
});
