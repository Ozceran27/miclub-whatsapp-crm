import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests, type PgPool } from "../../db/postgres.js";
import { getAdministrationWorkers } from "./workersService.js";

test.afterEach(() => setPostgresPoolForTests(undefined));

test("el último Director activo no puede perder su rol", async () => {
  setPostgresPoolForTests({
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (sql.includes("to_regclass")) return { rows: [{ employees: "miclub.employees" }] as T[] };
      assert.deepEqual(params, ["club-1", 20, 0]);
      return { rows: [{
        id: "employee-1", club_id: "club-1", person_id: "person-1", code: null,
        first_name: "Ada", last_name: "Lovelace", display_name: "Ada Lovelace", dni: null,
        phone: null, email: null, role: "Director", sector: null, salary: null, status: "active",
        system_access: true, employment_start_date: null, employment_end_date: null, notes: null,
        permissions: [], sector_ids: [], activities: [], active_director_count: "1",
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", total_count: "1",
      }] as T[] };
    },
    connect: async () => { throw new Error("connect no esperado"); },
    end: async () => undefined,
  } as PgPool);

  const response = await getAdministrationWorkers("club-1", 20, 0);
  assert.deepEqual(response.items[0].roleGuard, {
    isDirector: true,
    activeDirectorCount: 1,
    canRemoveDirectorRole: false,
    reason: "El club debe conservar al menos un Director activo.",
  });
});
