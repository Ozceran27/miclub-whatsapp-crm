import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";
import express from "express";
import { PERMISSIONS } from "@miclub/shared";
import { setPostgresPoolForTests, type PgPool } from "../db/postgres.js";
import moduleRoutes from "./moduleRoutes.js";

test("GET /api/modules/navigation respeta el enum estricto y la semántica null/activa", async () => {
  const fixtures = [
    { id: "active", name: "Activo", code: "activo", operational_status: "activa", archived_at: null },
    { id: "inactive", name: "Suspendido", code: "suspendido", operational_status: "suspendida", archived_at: null },
    { id: "null", name: "Sin estado", code: "sin-estado", operational_status: null, archived_at: null },
  ];
  let sectorSql = "";
  const pool = {
    async query<T>(sql: string) {
      if (sql.includes("from miclub.sectors")) {
        sectorSql = sql;
        // Emulate PostgreSQL's strict entity_status: an uncast English literal
        // in an enum expression fails before rows can be evaluated.
        if (/operational_status\s*[,<>=)]*\s*'(?:active|inactive)'/.test(sql)
          || /coalesce\(operational_status,\s*'(?:active|inactive)'/.test(sql)) {
          throw Object.assign(new Error("invalid input value for enum miclub.entity_status"), { code: "22P02" });
        }
        return { rows: fixtures.filter((row) => row.operational_status === null || row.operational_status === "activa") as T[] };
      }
      if (sql.includes("from miclub.club_capabilities")) return { rows: [] as T[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() { throw new Error("connect no esperado"); },
    async end() {},
  } as PgPool;
  setPostgresPoolForTests(pool);

  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId: "user", personId: "person", membershipId: "membership", clubId: "club", role: "DIRECTOR", email: "director@example.test", legacy: false, permissions: [PERMISSIONS.DASHBOARD_READ], sectorIds: [] };
    next();
  });
  app.use("/api/modules", moduleRoutes);
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/modules/navigation`);
    assert.equal(response.status, 200);
    const body = await response.json() as { sectors: Array<{ id: string }> };
    assert.deepEqual(body.sectors.map(({ id }) => id), ["active", "null"]);
    assert.match(sectorSql, /operational_status is null or operational_status::text = 'activa'/);
    assert.doesNotMatch(sectorSql, /'(?:active|inactive)'/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    setPostgresPoolForTests(undefined);
  }
});
