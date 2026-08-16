import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const movementRepository = new URL("./movementsRepository.ts", import.meta.url);
const enrollmentRepository = new URL("./enrollmentsRepository.ts", import.meta.url);
const migration = new URL("../../db/migrations/202608130006_tenant_entity_sequences.sql", import.meta.url);

test("manual creation allocates tenant sequences inside its INSERT transaction", async () => {
  const [movements, enrollments] = await Promise.all([
    readFile(movementRepository, "utf8"),
    readFile(enrollmentRepository, "utf8"),
  ]);
  assert.match(movements, /insert into miclub\.movements[\s\S]*miclub\.next_tenant_sequence\(\$1,'movement'\)/i);
  assert.match(enrollments, /insert into miclub\.enrollments[\s\S]*miclub\.next_tenant_sequence\(\$1, 'enrollment'\)/i);
});

test("the database allocator serializes conflicts and is rollback-safe", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /PRIMARY KEY \(club_id, entity_type\)/i);
  assert.match(sql, /ON CONFLICT \(club_id, entity_type\)[\s\S]*DO UPDATE SET last_value = tenant_sequence\.last_value \+ 1[\s\S]*RETURNING last_value/i);
  assert.match(sql, /UNIQUE \(club_id, sequence_number\)/gi);
  assert.doesNotMatch(sql, /CREATE SEQUENCE/i, "a non-transactional PostgreSQL sequence would not roll back");
});
