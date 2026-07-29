import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests } from "../db/postgres.js";
import {
  getAnnualEvolution,
  getClubFinanceSummary,
  getMonthlySummary,
  getPendingMovements,
  getRankingBySector,
  getRecentMovements,
} from "./economyRepository.js";

const CLUB_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLUB_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type QueryCall = { sql: string; params: unknown[] };

const withTenantFixture = async (
  run: (calls: QueryCall[]) => Promise<void>,
): Promise<void> => {
  const calls: QueryCall[] = [];
  const pool = {
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const clubId = params.find((value) => value === CLUB_A || value === CLUB_B);
      return { rows: [{ club_id: clubId, name: clubId === CLUB_A ? "Club A" : "Club B" }] as T[] };
    },
    connect: async () => { throw new Error("connect no esperado"); },
    end: async () => undefined,
  };
  setPostgresPoolForTests(pool);
  try {
    await run(calls);
  } finally {
    setPostgresPoolForTests(undefined);
  }
};

test("agregados y enrollments quedan aislados entre Club A y Club B", async () => {
  await withTenantFixture(async (calls) => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-02-01T00:00:00Z");
    const [summaryA] = await getMonthlySummary(from, to, CLUB_A);
    const [summaryB] = await getMonthlySummary(from, to, CLUB_B);
    const [evolutionA] = await getAnnualEvolution(CLUB_A, 2026, []);
    const [evolutionB] = await getAnnualEvolution(CLUB_B, 2026, []);

    assert.equal(summaryA.club_id, CLUB_A);
    assert.equal(summaryB.club_id, CLUB_B);
    assert.equal(evolutionA.club_id, CLUB_A);
    assert.equal(evolutionB.club_id, CLUB_B);
    assert.match(calls[0].sql, /m\.club_id = \$3/);
    assert.match(calls[2].sql, /e\.club_id = \$3/);
    assert.match(calls[2].sql, /a\.club_id = e\.club_id/);
    assert.match(calls[2].sql, /s\.club_id = a\.club_id/);
  });
});

test("Inicio y Economía consumen el corte PostgreSQL autoritativo de liquidez", async () => {
  await withTenantFixture(async (calls) => {
    await getClubFinanceSummary(CLUB_A);
    const query = calls[0];
    assert.deepEqual(query.params, [CLUB_A]);
    assert.match(query.sql, /from miclub\.operational_balances/);
    assert.match(query.sql, /order by cutoff_date desc, created_at desc/);
    assert.match(query.sql, /coalesce\(b\.liquidity, d\.liquidity, 0\)/);
    assert.match(query.sql, /coalesce\(d\.cuotas_a_cobrar, 0\)/);
    assert.match(query.sql, /coalesce\(d\.pending_net_balance, 0\)/);
  });
});

test("rankings, pendientes y movimientos recientes nunca mezclan tenants", async () => {
  await withTenantFixture(async (calls) => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-02-01T00:00:00Z");
    const operations = [
      () => getRankingBySector(from, to, 5, CLUB_A),
      () => getRankingBySector(from, to, 5, CLUB_B),
      () => getPendingMovements(20, CLUB_A),
      () => getPendingMovements(20, CLUB_B),
      () => getRecentMovements(20, CLUB_A),
      () => getRecentMovements(20, CLUB_B),
    ];
    for (let index = 0; index < operations.length; index += 2) {
      const [rowA] = await operations[index]();
      const [rowB] = await operations[index + 1]();
      assert.equal(rowA.club_id, CLUB_A);
      assert.equal(rowB.club_id, CLUB_B);
    }
    assert.match(calls[0].sql, /m\.club_id = \$5/);
    assert.match(calls[0].sql, /s\.club_id = m\.club_id/);
    assert.match(calls[2].sql, /where club_id = \$2/);
    assert.match(calls[4].sql, /where club_id = \$2/);
    for (const call of [calls[2], calls[3], calls[4], calls[5]]) {
      assert.doesNotMatch(call.sql, /select\s+\*/i);
      assert.doesNotMatch(call.sql, /source_payload|created_at\s*,|updated_at/i);
    }
  });
});
