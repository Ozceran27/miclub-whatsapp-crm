import assert from "node:assert/strict";
import test from "node:test";
import type { QueryExecutor } from "../db/postgres.js";
import { assertMigrationLedgerCompatible } from "./migrationPreflight.js";

const executor = (ledger: boolean, objects: number, entries = 0): QueryExecutor => ({
  async query<T>(sql: string) {
    const row = sql.includes("to_regclass") ? { ledger: ledger ? "miclub_schema_migrations" : null }
      : sql.includes("pg_class") ? { count: objects }
        : { count: entries };
    return { rows: [row as T] };
  },
});

test("permite instalar sobre una base realmente vacía", async () => {
  await assert.doesNotReject(assertMigrationLedgerCompatible(executor(false, 0)));
});

test("rechaza reproducir migraciones sobre un esquema manual sin ledger", async () => {
  await assert.rejects(assertMigrationLedgerCompatible(executor(false, 20)), /administrado manualmente/);
});

test("rechaza también el ledger vacío creado por un intento anterior", async () => {
  await assert.rejects(assertMigrationLedgerCompatible(executor(true, 20, 0)), /no debe reproducir/);
});

test("permite continuar una instalación versionada con entradas", async () => {
  await assert.doesNotReject(assertMigrationLedgerCompatible(executor(true, 20, 3)));
});
