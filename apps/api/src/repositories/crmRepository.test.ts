import test from "node:test";
import assert from "node:assert/strict";
import type { PgPool } from "../db/postgres.js";
import { setPostgresPoolForTests } from "../db/postgres.js";
import { insertHistory, type HistoryInput } from "./crmRepository.js";

const history: HistoryInput = {
  memberId: "enrollment-1",
  nombre: "Lucía Gómez",
  phone: "5491162341133",
  message: "Hola Lucía",
  waLink: "https://wa.me/5491162341133",
  status: "prepared",
  createdAt: "2026-07-31T12:00:00.000Z",
};

const historyRow = (legacySqliteId: number) => ({
  id: "7a73ec18-232e-45b5-beb7-b5d0e68c6677",
  legacy_sqlite_id: legacySqliteId,
  member_id: history.memberId,
  nombre: history.nombre,
  phone: history.phone,
  message: history.message,
  wa_link: history.waLink,
  status: history.status,
  created_at: history.createdAt,
  opened_at: null,
  sent_at: null,
  note: null,
  template_name: null,
});

test.afterEach(() => setPostgresPoolForTests(undefined));

test("insertHistory deja que PostgreSQL genere legacy_sqlite_id para mensajes nuevos", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ ready: true }] };
      return { rows: [historyRow(42)] };
    },
  } as PgPool;
  setPostgresPoolForTests(pool);

  const created = await insertHistory("club-1", history);

  assert.equal(created.historyId, 42);
  assert.doesNotMatch(queries[1].sql, /legacy_sqlite_id/);
  assert.equal(queries[1].params?.length, 14);
  assert.equal(queries[1].params?.[1], history.memberId);
});

test("insertHistory conserva el id legacy y el upsert idempotente durante migraciones", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ ready: true }] };
      return { rows: [historyRow(99)] };
    },
  } as PgPool;
  setPostgresPoolForTests(pool);

  const created = await insertHistory("club-1", { ...history, legacySqliteId: 99 });

  assert.equal(created.historyId, 99);
  assert.match(queries[1].sql, /legacy_sqlite_id/);
  assert.match(queries[1].sql, /on conflict \(club_id, legacy_sqlite_id\)/);
  assert.equal(queries[1].params?.[1], 99);
});
