import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateCategoryBalance, calculateOperatingProfitability, calculateVariation, type SectorProfitabilityMovement } from "./economyDomain.js";

type Fixture = {
  variation: { input: { current: number; previous: number }; expected: Record<string, unknown> };
  operating_profitability: { movements: SectorProfitabilityMovement[]; expected: Record<string, unknown> };
  category_balances: Array<{ categories: string[]; movements: SectorProfitabilityMovement[]; expected: Record<string, unknown> }>;
};

const loadApprovedFixture = async (): Promise<Fixture> => JSON.parse(await readFile(
  new URL("./fixtures/economy-characterization.approved.json", import.meta.url),
  "utf8",
)) as Fixture;

test("approved economy characterization results remain exact", async () => {
  const fixture = await loadApprovedFixture();
  assert.deepEqual(calculateVariation(fixture.variation.input.current, fixture.variation.input.previous), fixture.variation.expected);
  assert.deepEqual(calculateOperatingProfitability(fixture.operating_profitability.movements), fixture.operating_profitability.expected);
  for (const example of fixture.category_balances) {
    assert.deepEqual(calculateCategoryBalance(example.movements, example.categories), example.expected);
  }
});
