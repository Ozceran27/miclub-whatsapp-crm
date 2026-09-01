import assert from "node:assert/strict";
import test from "node:test";
import { calculateSectorCapacity } from "./administrationSummaryService.js";

test("capacity modes handle records, ties, empty months and no history", () => {
  assert.deepEqual(calculateSectorCapacity({ capacityMode:"INCOME", historicalClosedMonthlyIncome:[], currentMonthIncome:0 }).dataStatus,"NO_DATA");
  assert.equal(calculateSectorCapacity({ capacityMode:"INCOME", historicalClosedMonthlyIncome:[100,100], currentMonthIncome:0 }).idlePercentage,100);
  const exceeded=calculateSectorCapacity({ capacityMode:"INCOME", historicalClosedMonthlyIncome:[100,80], currentMonthIncome:120 });
  assert.equal(exceeded.utilizationPercentage,120); assert.equal(exceeded.idlePercentage,0);
});

test("enrollment capacity permits overoccupancy but rejects an invalid denominator as no data", () => {
  const full=calculateSectorCapacity({ capacityMode:"ENROLLMENTS", configuredCapacity:10, activeEnrollments:12 });
  assert.equal(full.utilizationPercentage,120); assert.equal(full.idlePercentage,0);
  assert.equal(calculateSectorCapacity({ capacityMode:"ENROLLMENTS", configuredCapacity:0, activeEnrollments:1 }).dataStatus,"NO_DATA");
});
