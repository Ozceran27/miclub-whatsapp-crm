import assert from "node:assert/strict";
import test from "node:test";
import { calculateFeesToCollect, calculateOperationalBalances, calculatePendingBalance, calculateSettlementBalance, normalizeCommissionRate } from "./operationalBalancesCalculator.js";

test("Cuotas a Cobrar aplica comisiones por sector solo a ADEUDANDO", () => {
  assert.equal(calculateFeesToCollect([{ enrollmentId: 1, status: "Adeudando", feeAmount: 20_000, sector: "FITNESS" }]).total, 10_000);
  assert.equal(calculateFeesToCollect([{ enrollmentId: 2, status: "Adeudando", feeAmount: 20_000, sector: "SALÓN" }]).total, 0);
  assert.equal(calculateFeesToCollect([{ enrollmentId: 3, status: "Adeudando", feeAmount: 20_000, sector: "AULA", activityCommissionPercent: 40 }]).total, 8_000);
  assert.equal(calculateFeesToCollect([
    { enrollmentId: 1, status: "Adeudando", feeAmount: 20_000, sector: "FITNESS" },
    { enrollmentId: 2, status: "Adeudando", feeAmount: 20_000, sector: "SALÓN" },
    { enrollmentId: 3, status: "Adeudando", feeAmount: 20_000, sector: "AULA", activityCommissionPercent: 0.4 },
  ]).total, 18_000);
});

test("Cuotas a Cobrar excluye cuota cero, abandonado, cancelado, al día y duplicados", () => {
  const result = calculateFeesToCollect([
    { enrollmentId: 1, status: "Adeudando", feeAmount: 0, sector: "FITNESS" },
    { enrollmentId: 2, status: "Abandonado", feeAmount: 20_000, sector: "FITNESS" },
    { enrollmentId: 3, status: "Cancelado", feeAmount: 20_000, sector: "FITNESS" },
    { enrollmentId: 4, status: "Al día", feeAmount: 20_000, sector: "FITNESS" },
    { enrollmentId: 5, status: "Adeudando", feeAmount: 20_000, sector: "FITNESS" },
    { enrollmentId: 5, status: "Adeudando", feeAmount: 20_000, sector: "FITNESS" },
  ]);
  assert.equal(result.total, 10_000);
  assert.equal(result.enrollmentCount, 1);
});

test("normaliza porcentajes de comisión y rechaza fuera de rango", () => {
  assert.equal(normalizeCommissionRate(40), 0.4);
  assert.equal(normalizeCommissionRate(0.4), 0.4);
  assert.equal(normalizeCommissionRate(140), 0);
});

test("Saldos a Liquidar suma LOCAL 1, FITNESS, SALÓN y AULA con salida negativa y sin duplicar", () => {
  const result = calculateSettlementBalance([
    { sector: "LOCAL 1", amount: 20 },
    { sector: "FITNESS", amount: 40 },
    { sector: "SALÓN", amount: 30 },
    { sector: "AULA", amount: 10 },
    { sector: "AULA", amount: 999 },
    { sector: "CANTINA", amount: 50 },
  ]);
  assert.deepEqual(result, { total: -100, local1: 20, fitness: 40, salon: 30, aula: 10 });
});

test("Saldos a Liquidar conserva signos sectoriales e invierte una sola vez el total final", () => {
  assert.deepEqual(calculateSettlementBalance([
    { sector: "LOCAL 1", amount: 0 },
    { sector: "FITNESS", amount: 625_000 },
    { sector: "AULA", amount: 96_000 },
    { sector: "SALÓN", amount: -390_000 },
  ]), { total: -331_000, local1: 0, fitness: 625_000, salon: -390_000, aula: 96_000 });

  assert.deepEqual(calculateSettlementBalance([
    { sector: "LOCAL 1", amount: 100 },
    { sector: "FITNESS", amount: 200 },
    { sector: "AULA", amount: 300 },
    { sector: "SALÓN", amount: 400 },
  ]), { total: -1_000, local1: 100, fitness: 200, salon: 400, aula: 300 });

  assert.deepEqual(calculateSettlementBalance([
    { sector: "LOCAL 1", amount: 0 },
    { sector: "FITNESS", amount: 0 },
    { sector: "AULA", amount: 0 },
    { sector: "SALÓN", amount: 0 },
  ]), { total: 0, local1: 0, fitness: 0, salon: 0, aula: 0 });

  assert.deepEqual(calculateSettlementBalance([
    { sector: "LOCAL 1", amount: -100 },
    { sector: "FITNESS", amount: 0 },
    { sector: "AULA", amount: 0 },
    { sector: "SALÓN", amount: 0 },
  ]), { total: 100, local1: -100, fitness: 0, salon: 0, aula: 0 });
});

test("Saldos Pendientes es ingresos pendientes menos egresos pendientes de Administración", () => {
  assert.equal(calculatePendingBalance([
    { id: 1, movementType: "INGRESOS", amount: 500, operationalStatus: "PENDIENTE", sourceSheet: "ADMINISTRACIÓN" },
    { id: 2, movementType: "EGRESOS", amount: 200, financialStatus: "pendiente", sourceSheet: "ADMINISTRACIÓN" },
  ]).net, 300);
  assert.equal(calculatePendingBalance([
    { id: 1, movementType: "INGRESOS", amount: 100, operationalStatus: "PENDIENTE", sourceSheet: "ADMINISTRACIÓN" },
    { id: 2, movementType: "EGRESOS", amount: 300, operationalStatus: "PENDIENTE", sourceSheet: "ADMINISTRACIÓN" },
  ]).net, -200);
});

test("Saldos Pendientes excluye completados y CAPITAL pendiente", () => {
  assert.equal(calculatePendingBalance([
    { id: 1, movementType: "INGRESOS", amount: 500, operationalStatus: "COMPLETADO", sourceSheet: "ADMINISTRACIÓN" },
    { id: 2, movementType: "CAPITAL", amount: 1000, operationalStatus: "PENDIENTE", sourceSheet: "ADMINISTRACIÓN" },
  ]).net, 0);
});

test("Saldo Proyectado suma liquidez, cuotas, saldos a liquidar recibido y pendientes sin doble resta", () => {
  const result = calculateOperationalBalances({ liquidity: 1_000, feesToCollect: 180, settlementBalance: -100, pendingBalance: 300 });
  assert.equal(result.settlementBalance, -100);
  assert.equal(result.projectedBalance, 1_380);
  assert.notEqual(result.projectedBalance, 1_580);

  const positiveSettlement = calculateOperationalBalances({ liquidity: 1_000, feesToCollect: 180, settlementBalance: 100, pendingBalance: 300 });
  assert.equal(positiveSettlement.settlementBalance, 100);
  assert.equal(positiveSettlement.projectedBalance, 1_580);
});
