import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { FinancialCircuit } from '@miclub/shared';
import { aggregateWorkerBalances } from './workerBalancesService.js';

const circuit = (overrides: Partial<FinancialCircuit> = {}): FinancialCircuit => ({
  month: '2026-09', today: '2026-09-23', settlements: [], balanceTotals: [], diagnostics: [],
  projection: { calculatedAt: '', currencyCode: 'ARS', liquidity: null, pendingCollections: 0, pendingPayments: 0, pendingSettlements: 0, expectedSettlements: 0, additionalClubReceivables: 0, projectedBalance: null, futureEstimate: null, complete: true, assumptions: [] },
  accounts: [], people: [], terms: [], ...overrides,
});
const settlement = (personId: string, currencyCode: string, balance: number, reviewState: 'APPROVED' | 'DRAFT' = 'APPROVED') => ({
  id: `${personId}-${currencyCode}`, personId, currencyCode, balance, reviewState, month: '2026-09', activityId: 'a', termId: 't', income: 0, refunds: 0, responsibleIncome: 0, responsibleRefunds: 0, fixedClubFee: 0, payments: 0, debtCollections: 0, paymentState: 'PENDING' as const, revision: 1, closedAt: null, personName: '', activityName: '',
});

void test('agrega deuda y crédito por persona y moneda sin convertir ni filtrar borradores devengados', () => {
  const result = aggregateWorkerBalances([{ id: 'w1', person_id: 'p1' }, { id: 'w2', person_id: 'p2' }], circuit({
    settlements: [settlement('p1', 'ARS', 40_000, 'DRAFT'), settlement('p1', 'ARS', -10_000), settlement('p1', 'USD', -25), settlement('p2', 'ARS', 50)],
    compensationObligations: [
      { id: 'o1', employeeId: 'w1', personId: 'p1', personName: '', currencyCode: 'ARS', periodFrom: '2026-09-01', periodTo: '2026-09-20', dueDate: '2026-09-20', amount: 15_000, paid: 5_000, balance: 10_000, reviewState: 'DRAFT', revision: 1, sectorId: null },
      { id: 'o2', employeeId: 'w1', personId: 'p1', personName: '', currencyCode: 'ARS', periodFrom: '2026-09-24', periodTo: '2026-09-30', dueDate: '2026-09-30', amount: 80_000, paid: 0, balance: 80_000, reviewState: 'APPROVED', revision: 1, sectorId: null },
    ],
  }), [{ workerId: 'w1', personId: 'p1', currencyCode: 'ARS', balance: 2_000 }], false, [{ workerId: 'w1', personId: 'p1', currencyCode: 'ARS', balance: 3_000 }]);
  assert.deepEqual(result.items[0].amounts, [
    { currencyCode: 'ARS', amount: 45_000, pendingReview: true },
    { currencyCode: 'USD', amount: -25, pendingReview: false },
  ]);
  assert.deepEqual(result.items[1].amounts, [{ currencyCode: 'ARS', amount: 50, pendingReview: false }]);
  assert.equal(result.scope, 'VISIBLE_SECTORS');
});

void test('marca incompleto sólo al receptor de una actividad con diagnóstico', () => {
  const result = aggregateWorkerBalances([{ id: 'w1', person_id: 'p1' }, { id: 'w2', person_id: 'p2' }], circuit({
    diagnostics: [{ activityId: 'a', message: 'Acuerdo incompleto' }],
    terms: [{ id: 't', activityId: 'a', activityName: '', personId: 'p1', revision: 1, mode: 'FIXED', effectiveFrom: '2026-01-01', effectiveTo: null, fixedClubFee: 10, partialMonthPolicy: null }],
  }), [], true);
  assert.equal(result.items[0].status, 'INCOMPLETE');
  assert.equal(result.items[1].status, 'AVAILABLE');
});

void test('la ruta financiera exige ambos permisos y no acepta club desde el cliente', () => {
  const route = readFileSync(new URL('../../routes/administrationRoutes.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('./workerBalancesService.ts', import.meta.url), 'utf8');
  const circuit = readFileSync(new URL('../financialCircuitService.ts', import.meta.url), 'utf8');
  assert.match(route, /"\/workers\/balances", requirePermission\(PERMISSIONS\.WORKERS_VIEW\), requirePermission\(PERMISSIONS\.FINANCE_READ\)/);
  assert.match(route, /getAdministrationWorkerBalances\(req\.auth!, limit, offset\)/);
  assert.match(service, /getWorkersPage\(auth\.clubId, limit, offset\)/);
  assert.match(service, /readFinancialCircuit\(auth\)/);
  assert.match(service, /where o\.club_id=\$1 and e\.id=any\(\$2::uuid\[\]\)/);
  assert.match(circuit, /o\.due_date<=f\.cutoff_date/);
});
