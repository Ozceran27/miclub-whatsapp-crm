import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests, type PgPool } from "../db/postgres.js";
import { getReadOnlyPage } from "./readOnlyRepository.js";

void test.afterEach(() => setPostgresPoolForTests(undefined));

void test("las listas aplican paginación, filtros y tenant en datos y total", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool: PgPool = {
    query: <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "37" }] : [{ id: "movement-1" }]) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  setPostgresPoolForTests(pool);

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

void test("el contador de sectores incluye sólo actividades canónicamente activas y no archivadas", async () => {
  const calls: string[] = [];
  const pool: PgPool = {
    query: <T>(sql: string) => {
      calls.push(sql);
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "0" }] : []) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  setPostgresPoolForTests(pool);

  await getReadOnlyPage("sectores", { clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", limit: 20, offset: 0, filters: {} });

  assert.match(calls[0] ?? "", /a\.status = 'activa'::miclub\.entity_status/);
  assert.match(calls[0] ?? "", /a\.archived_at is null/);
  assert.doesNotMatch(calls[0] ?? "", /a\.status = 'active'/);
});
