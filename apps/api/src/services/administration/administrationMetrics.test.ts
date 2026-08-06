import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCapacityByAmount,
  calculateCapacityByPeople,
  calculateCommission,
  calculateGeneralAverage,
  calculateGrowth,
  calculateOperatingProfitability,
  isValidAdministrationStatus,
} from "./administrationMetrics.js";

test("calcula la capacidad por personas", () => {
  assert.equal(calculateCapacityByPeople(45, 60), 75);
  assert.equal(calculateCapacityByPeople(0, 0), 0);
});

test("calcula la capacidad por monto", () => {
  assert.equal(calculateCapacityByAmount(150_000, 200_000), 75);
  assert.equal(calculateCapacityByAmount(0, 0), 0);
});

test("calcula el promedio general y descarta valores no finitos", () => {
  assert.equal(calculateGeneralAverage([60, 80, 100]), 80);
  assert.equal(calculateGeneralAverage([60, Number.NaN, 100]), 80);
  assert.equal(calculateGeneralAverage([]), 0);
});

test("el crecimiento no produce infinito con denominador cero", () => {
  assert.equal(calculateGrowth(100, 0), null);
  assert.equal(calculateGrowth(0, 0), 0);
  assert.equal(calculateGrowth(150, 100), 50);
});

test("calcula la rentabilidad operativa como ingresos menos egresos", () => {
  assert.equal(calculateOperatingProfitability(250_000, 90_000), 160_000);
});

test("calcula comisiones expresadas como porcentaje o proporción", () => {
  assert.equal(calculateCommission(12_345, 20), 2_469);
  assert.equal(calculateCommission(12_345, 0.2), 2_469);
});

test("valida únicamente estados operativos completados", () => {
  assert.equal(isValidAdministrationStatus(" Completado "), true);
  assert.equal(isValidAdministrationStatus("completed"), true);
  assert.equal(isValidAdministrationStatus("Pendiente"), false);
  assert.equal(isValidAdministrationStatus("Anulado"), false);
  assert.equal(isValidAdministrationStatus(null), false);
});
