import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBalanceTotals } from './financialCircuitService.js';

test('separa saldos a liquidar, a cobrar y remuneración fija por moneda', () => {
  const totals = calculateBalanceTotals([
    { currencyCode: 'ARS', balance: 40_000 },
    { currencyCode: 'ARS', balance: -25_000 },
    { currencyCode: 'USD', balance: 100 },
  ], [
    { currencyCode: 'ARS', balance: 12_000, reviewState: 'APPROVED' },
    { currencyCode: 'ARS', balance: 9_000, reviewState: 'DRAFT' },
  ]);
  assert.deepEqual(totals, [
    { currencyCode: 'ARS', activityToPay: 40_000, activityToCollect: 25_000, fixedCompensationToPay: 12_000, totalToPay: 52_000 },
    { currencyCode: 'USD', activityToPay: 100, activityToCollect: 0, fixedCompensationToPay: 0, totalToPay: 100 },
  ]);
});
