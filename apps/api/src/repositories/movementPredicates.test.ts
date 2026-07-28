import assert from "node:assert/strict";
import test from "node:test";
import { isCompletedMovementStatus, isPendingMovementStatus, MOVEMENT_OPERATIONAL_STATUSES } from "@miclub/shared";
import { completedMovementPredicate, pendingMovementPredicate } from "./movementPredicates.js";

test("el contrato refleja exactamente el enum real, incluido ANULADO", () => {
  assert.deepEqual(MOVEMENT_OPERATIONAL_STATUSES, ["COMPLETADO", "PENDIENTE", "CANCELADO", "ANULADO"]);
});

test("métricas ordinarias incluyen solo COMPLETADO para los cuatro estados", () => {
  assert.deepEqual(MOVEMENT_OPERATIONAL_STATUSES.map(isCompletedMovementStatus), [true, false, false, false]);
  assert.equal(completedMovementPredicate("movement"), "movement.operational_status = 'COMPLETADO'");
});

test("cálculos pendientes incluyen solo PENDIENTE para los cuatro estados", () => {
  assert.deepEqual(MOVEMENT_OPERATIONAL_STATUSES.map(isPendingMovementStatus), [false, true, false, false]);
  assert.equal(pendingMovementPredicate("movement"), "movement.operational_status = 'PENDIENTE'");
});
