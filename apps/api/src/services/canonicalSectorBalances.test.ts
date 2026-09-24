import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialCircuit } from '@miclub/shared';
import { aggregateSectorBalances } from './canonicalSectorBalances.js';

const base = { month: '2026-09', today: '2026-09-23', balanceTotals: [], compensationObligations: [], diagnostics: [], projection: { calculatedAt: '', currencyCode: 'ARS', liquidity: null, pendingCollections: 0, pendingPayments: 0, pendingSettlements: 0, expectedSettlements: 0, additionalClubReceivables: 0, projectedBalance: null, futureEstimate: null, complete: true, assumptions: [] }, accounts: [], people: [], terms: [] };
const settlement = (activityId: string, currencyCode: string, balance: number) => ({ id: activityId, activityId, personId: 'p', currencyCode, balance, termId: 't', month: '2026-09', income: 0, refunds: 0, responsibleIncome: 0, responsibleRefunds: 0, fixedClubFee: 0, payments: 0, debtCollections: 0, paymentState: 'PENDING', revision: 1, reviewState: 'APPROVED', closedAt: null, personName: '', activityName: '' });

void test('los sectores agregan el saldo firmado del circuito y rechazan mezcla nominal de monedas', () => {
  const result = aggregateSectorBalances({ ...base, settlements: [settlement('a1', 'ARS', 40_000), settlement('a2', 'ARS', -10_000), settlement('a3', 'USD', 50)] } as FinancialCircuit, 'ARS', new Map([['a1','s1'],['a2','s1'],['a3','s2']]));
  assert.deepEqual(result, [{ sectorId: 's1', amount: 30_000, currencyCode: 'ARS' }, { sectorId: 's2', amount: null, currencyCode: 'ARS' }]);
});

void test('un diagnóstico impide presentar un saldo sectorial incompleto como cero', () => {
  const result = aggregateSectorBalances({ ...base, settlements: [settlement('a1', 'ARS', 0)], diagnostics: [{ activityId: 'a1', message: 'Incompleto' }] } as FinancialCircuit, 'ARS', new Map([['a1','s1']]));
  assert.deepEqual(result, [{ sectorId: 's1', amount: null, currencyCode: 'ARS' }]);
});
