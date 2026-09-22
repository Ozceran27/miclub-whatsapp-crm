import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests, type PgPool } from "../db/postgres.js";
import { getReadOnlyPage } from "./readOnlyRepository.js";

void test.afterEach(() => setPostgresPoolForTests(undefined));

void test("las listas aplican paginación, filtros y tenant en datos y total", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool: PgPool = {
    query: <T>(sql: string, params: unknown[] = []) => {
      if (['BEGIN','COMMIT','ROLLBACK'].includes(sql) || sql.includes('set_config')) return Promise.resolve({rows:[]});
      calls.push({ sql, params });
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "37" }] : [{ id: "movement-1" }]) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  pool.connect = () => Promise.resolve({query:pool.query,release:()=>undefined});
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
      if (['BEGIN','COMMIT','ROLLBACK'].includes(sql) || sql.includes('set_config')) return Promise.resolve({rows:[]});
      calls.push(sql);
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "0" }] : []) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  pool.connect = () => Promise.resolve({query:pool.query,release:()=>undefined});
  setPostgresPoolForTests(pool);

  await getReadOnlyPage("sectores", { clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", limit: 20, offset: 0, filters: {} });

  assert.match(calls[0] ?? "", /a\.status = 'activa'::miclub\.entity_status/);
  assert.match(calls[0] ?? "", /a\.archived_at is null/);
  assert.doesNotMatch(calls[0] ?? "", /a\.status = 'active'/);
  assert.match(calls[0] ?? "", /s\.archived_at is null/);
  assert.match(calls[0] ?? "", /movement\.club_id = s\.club_id and movement\.sector_id = s\.id/);
  assert.match(calls[0] ?? "", /movement\.operational_status = 'COMPLETADO'/);
  assert.match(calls[0] ?? "", /catalog\.classification = 'OPERATIONAL'/);
  assert.match(calls[0] ?? "", /miclub\.exchange_rates/);
  assert.match(calls[0] ?? "", /INCOMPLETE_EXCHANGE_RATE/);
  assert.match(calls[0] ?? "", /movement\.amount \* rate\.rate/);
  assert.match(calls[0] ?? "", /movement\.amount \/ rate\.rate/);
  assert.match(calls[0] ?? "", /make_timestamptz/);
  assert.match(calls[0] ?? "", /club\.base_currency_code as operating_currency_code/);
});

void test("las actividades archivadas no reaparecen en el catálogo administrativo", async () => {
  const calls: string[] = [];
  const pool: PgPool = {
    query: <T>(sql: string) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("set_config")) return Promise.resolve({ rows: [] });
      calls.push(sql);
      if (sql.includes("pg_attribute")) return Promise.resolve({ rows: [{ available: true }] as T[] });
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "0" }] : []) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  pool.connect = () => Promise.resolve({ query: pool.query, release: () => undefined });
  setPostgresPoolForTests(pool);

  await getReadOnlyPage("actividades", { clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", limit: 20, offset: 0, filters: {} });

  assert.match(calls[1] ?? "", /a\.archived_at is null/);
  assert.match(calls[2] ?? "", /a\.archived_at is null/);
  const query = calls[1] ?? "";
  assert.match(query, /movement\.activity_id=a\.id/);
  assert.match(query, /movement\.operational_status='COMPLETADO'/);
  assert.match(query, /catalog\.classification='OPERATIONAL'/);
  assert.match(query, /movement\.amount\*rate\.rate/);
  assert.match(query, /movement\.amount\/rate\.rate/);
  assert.match(query, /INCOMPLETE_EXCHANGE_RATE/);
  assert.match(query, /NO_MOVEMENTS/);
  assert.match(query, /make_timestamptz/);
  assert.match(query, /activity_club\.base_currency_code as operating_currency_code/);
});

void test("actividades conserva lectura legacy mientras la migración de responsable está pendiente", async () => {
  const calls: string[] = [];
  const pool: PgPool = {
    query: <T>(sql: string) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("set_config")) return Promise.resolve({ rows: [] });
      calls.push(sql);
      if (sql.includes("pg_attribute")) return Promise.resolve({ rows: [{ available: false }] as T[] });
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "0" }] : []) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  pool.connect = () => Promise.resolve({ query: pool.query, release: () => undefined });
  setPostgresPoolForTests(pool);

  await getReadOnlyPage("actividades", { clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", limit: 20, offset: 0, filters: {} });

  assert.match(calls[1] ?? "", /responsible_employee\.id as responsible_employee_id/);
  assert.match(calls[1] ?? "", /e\.person_id=i\.person_id/);
  assert.match(calls[1] ?? "", /order by e\.created_at,e\.id limit 1/);
  assert.doesNotMatch(calls[1] ?? "", /a\.responsible_employee_id/);
});

void test("movimientos toma activity_id de la tabla base y no de la vista enriquecida", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool: PgPool = {
    query: <T>(sql: string, params: unknown[] = []) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("set_config")) return Promise.resolve({ rows: [] });
      calls.push({ sql, params });
      return Promise.resolve({ rows: (sql.includes("count(*) as total_count") ? [{ total_count: "0" }] : []) as T[] });
    },
    connect: () => Promise.reject(new Error("connect no esperado")),
    end: () => Promise.resolve(),
  };
  pool.connect = () => Promise.resolve({ query: pool.query, release: () => undefined });
  setPostgresPoolForTests(pool);

  await getReadOnlyPage("movimientos", {
    clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    limit: 20,
    offset: 0,
    filters: { activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  });

  assert.match(calls[0]?.sql ?? "", /movement_sequence\.activity_id/);
  assert.doesNotMatch(calls[0]?.sql ?? "", /m\.activity_id/);
  assert.deepEqual(calls[0]?.params, [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    20,
    0,
  ]);
});
