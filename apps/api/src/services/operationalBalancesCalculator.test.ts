import assert from "node:assert/strict";
import test from "node:test";
import { calculateOperationalBalances, calculatePendingBalance } from "./operationalBalancesCalculator.js";

test("Saldos Pendientes es ingresos pendientes menos egresos pendientes de Administración", () => {
  assert.equal(calculatePendingBalance([
    { id: 1, movementType: "INGRESOS", amount: 500, operationalStatus: "PENDIENTE", sourceSheet: "ADMINISTRACIÓN" },
    { id: 2, movementType: "EGRESOS", amount: 200, operationalStatus: "PENDIENTE", financialStatus: "pendiente", sourceSheet: "ADMINISTRACIÓN" },
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

test("Saldos Pendientes clasifica los cuatro estados reales y no rescata COMPLETADO por financial_status", () => {
  const result = calculatePendingBalance([
    { id: 1, movementType: "INGRESOS", amount: 10, operationalStatus: "COMPLETADO", financialStatus: "pendiente", sourceSheet: "ADMINISTRACIÓN" },
    { id: 2, movementType: "INGRESOS", amount: 20, operationalStatus: "PENDIENTE", sourceSheet: "ADMINISTRACIÓN" },
    { id: 3, movementType: "INGRESOS", amount: 40, operationalStatus: "CANCELADO", financialStatus: "pendiente", sourceSheet: "ADMINISTRACIÓN" },
    { id: 4, movementType: "INGRESOS", amount: 80, operationalStatus: "ANULADO", financialStatus: "pendiente", sourceSheet: "ADMINISTRACIÓN" },
  ]);
  assert.deepEqual(result, { income: 20, expenses: 0, net: 20 });
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
