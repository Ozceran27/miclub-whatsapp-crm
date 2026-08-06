import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests, type PgPool } from "../db/postgres.js";
import { getReadOnlyPage } from "./readOnlyRepository.js";

test.afterEach(() => setPostgresPoolForTests(undefined));

test("las listas aplican paginación, filtros y tenant en datos y total", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  setPostgresPoolForTests({
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: (sql.includes("count(*) as total_count") ? [{ total_count: "37" }] : [{ id: "movement-1" }]) as T[] };
    },
    connect: async () => { throw new Error("connect no esperado"); },
    end: async () => undefined,
  } as PgPool);

  const page = await getReadOnlyPage("movimientos", {
    clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    limit: 10,
    offset: 20,
    filters: { search: " cuota social ", type: "INGRESOS", operationalStatus: "COMPLETADO" },
  });

  assert.deepEqual(page, { rows: [{ id: "movement-1" }], total: 37 });
  assert.deepEqual(calls[0].params, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "% cuota social %", "INGRESOS", "COMPLETADO", 10, 20]);
  assert.deepEqual(calls[1].params, calls[0].params.slice(0, -2));
  for (const call of calls) {
    assert.match(call.sql, /m\.club_id = \$1/);
    assert.match(call.sql, /m\.movement_type = \$3::miclub\.movement_type/);
    assert.match(call.sql, /m\.operational_status = \$4::miclub\.movement_status/);
  }
  assert.match(calls[0].sql, /limit \$5\s+offset \$6/);
});
