import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests } from "../db/postgres.js";
import { getEconomyClubSectorBalances, getEconomyClubSummary, listEconomyClubMovements } from "./economyClubService.js";

const CLUB_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLUB_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("los endpoints del módulo economy filtran vistas por el club autenticado", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const clubId = params[0];
      if (sql.includes("v_dashboard_basic")) {
        return { rows: [{ total_income: clubId === CLUB_A ? 100 : 200 }] as T[] };
      }
      if (sql.includes("v_sector_finance_summary")) {
        return { rows: [{ sector_name: clubId === CLUB_A ? "Sector A" : "Sector B" }] as T[] };
      }
      return { rows: [{ id: clubId, movement_type: "INGRESOS", operational_status: "COMPLETADO" }] as T[] };
    },
    connect: async () => { throw new Error("connect no esperado"); },
    end: async () => undefined,
  };
  setPostgresPoolForTests(pool);
  try {
    assert.equal((await getEconomyClubSummary(CLUB_A)).totals.income, 100);
    assert.equal((await getEconomyClubSummary(CLUB_B)).totals.income, 200);
    assert.equal((await getEconomyClubSectorBalances(CLUB_A))[0].sectorName, "Sector A");
    assert.equal((await getEconomyClubSectorBalances(CLUB_B))[0].sectorName, "Sector B");
    assert.equal((await listEconomyClubMovements(CLUB_A, 10))[0].id, CLUB_A);
    assert.equal((await listEconomyClubMovements(CLUB_B, 10))[0].id, CLUB_B);
    for (const call of calls) {
      assert.match(call.sql, /where club_id = \$1/);
      assert.ok(call.params[0] === CLUB_A || call.params[0] === CLUB_B);
    }
  } finally {
    setPostgresPoolForTests(undefined);
  }
});
