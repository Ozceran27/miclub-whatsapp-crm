import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFinancialProjection } from './operationalBalancesCalculator.js';

const input = () => ({ calculatedAt: '2026-09-09T12:00:00Z', currencyCode: 'ARS', liquidity: 0,
  pendingCollections: [{ obligationId: 'gym-sept', amount: 10000, responsibleAmount: 5000 }],
  pendingPayments: [], pendingSettlements: [], unpaidReceivables: [],
});

void test('Gym pendiente 10000 al 50% aporta 5000 netos', () => {
  const result = calculateFinancialProjection(input());
  assert.equal(result.projectedBalance, 5000);
  assert.equal(result.expectedSettlements, 5000);
});

void test('una cuota vinculada a movimiento no se suma de nuevo a estimación', () => {
  const data = input();
  const result = calculateFinancialProjection({ ...data, unpaidReceivables: [{ ...data.pendingCollections[0], abandoned: false }, { obligationId: 'arte', amount: 20000, responsibleAmount: 12000, abandoned: false }] });
  assert.equal(result.additionalClubReceivables, 8000);
  assert.equal(result.futureEstimate, 13000);
});

void test('FIXED no agrega estimación por cuotas; abandono queda excluido', () => {
  const result = calculateFinancialProjection({ ...input(), unpaidReceivables: [
    { obligationId: 'yoga', amount: 20000, responsibleAmount: 20000, abandoned: false },
    { obligationId: 'baja', amount: 10000, responsibleAmount: 5000, abandoned: true },
  ] });
  assert.equal(result.futureEstimate, 5000);
});

void test('pago pendiente y su liquidación son una misma obligación', () => {
  const obligation = { obligationId: 'liquidacion-ana', amount: 1000 };
  const result = calculateFinancialProjection({ ...input(), pendingPayments: [obligation], pendingSettlements: [obligation] });
  assert.equal(result.projectedBalance, 4000);
});

void test('cotización faltante mantiene desglose y total incompleto', () => {
  const result = calculateFinancialProjection({ ...input(), missingValuations: ['USD/caja'] });
  assert.equal(result.projectedBalance, null);
  assert.equal(result.futureEstimate, null);
  assert.equal(result.complete, false);
  assert.equal(result.pendingCollections, 10000);
});

void test('liquidación prevista persistida no duplica la obligación del cobro', () => {
  const data = input();
  const result = calculateFinancialProjection({ ...data,
    pendingCollections: [{ ...data.pendingCollections[0], responsibleObligationId: 'forecast-gym' }],
    pendingSettlements: [{ obligationId: 'forecast-gym', amount: 5000 }],
  });
  assert.equal(result.projectedBalance, 5000);
  assert.equal(result.expectedSettlements, 0);
});

void test('coincidencias inconsistentes exigen conciliación, sin elegir silenciosamente', () => {
  const data = input();
  assert.throws(() => calculateFinancialProjection({ ...data, unpaidReceivables: [{ ...data.pendingCollections[0], amount: 20000, abandoned: false }] }), /reconciliation/);
  assert.throws(() => calculateFinancialProjection({ ...data, unpaidReceivables: [{ ...data.pendingCollections[0], responsibleAmount: 3000, abandoned: false }] }), /reconciliation/);
});
