import assert from "node:assert/strict";
import test from "node:test";
import { setPostgresPoolForTests, type PgClient, type PgPool } from "../db/postgres.js";
import { createEnrollment, type EnrollmentActor } from "./enrollmentsRepository.js";

const CLUB_A = "11111111-1111-4111-8111-111111111111";
const CLUB_B = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTIVITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor: EnrollmentActor = {
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  clubId: CLUB_A,
};

type ActivityFixture = {
  clubId: string;
  status: "activa" | "suspendida" | "cancelada";
  archived: boolean;
  generatesEnrollments: boolean;
  personClubId: string;
};

const installPool = (fixture: ActivityFixture) => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const enrollments: Array<Record<string, unknown>> = [];
  const client: PgClient = {
    query: (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return Promise.resolve({ rows: [] });
      if (sql.includes("from miclub.people p")) {
        const eligible = fixture.personClubId === params?.[0]
          && fixture.clubId === fixture.personClubId
          && fixture.status === "activa"
          && !fixture.archived
          && fixture.generatesEnrollments;
        return Promise.resolve({ rows: eligible ? [{ person_id: PERSON_ID, activity_id: ACTIVITY_ID }] : [] });
      }
      if (sql.includes("from miclub.enrollments")) return Promise.resolve({ rows: [] });
      if (sql.includes("insert into miclub.enrollments")) {
        const enrollment = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", club_id: CLUB_A, person_id: params?.[1], activity_id: params?.[2] };
        enrollments.push(enrollment);
        return Promise.resolve({ rows: [enrollment] });
      }
      if (sql.includes("INSERT INTO miclub.audit_log")) return Promise.resolve({ rows: [{ id: "audit-1" }] });
      return Promise.reject(new Error(`SQL inesperado: ${sql}`));
    },
    release: () => undefined,
  };
  const pool: PgPool = { connect: () => Promise.resolve(client), query: client.query, end: () => Promise.resolve() };
  setPostgresPoolForTests(pool);
  return { queries, enrollments };
};

const input = {
  personId: PERSON_ID,
  activityId: ACTIVITY_ID,
  feeAmount: 25000,
  status: "nuevo_inscripto" as const,
  enrollmentDate: "2026-08-16",
};

void test.afterEach(() => setPostgresPoolForTests(undefined));

void test("inscribe una persona del club en una actividad activa que genera inscripciones", async () => {
  const state = installPool({ clubId: CLUB_A, personClubId: CLUB_A, status: "activa", archived: false, generatesEnrollments: true });

  const result = await createEnrollment(actor, input);

  assert.equal(result.kind, "created");
  assert.equal(state.enrollments.length, 1);
  const referenceQuery = state.queries.find(({ sql }) => sql.includes("from miclub.people p"));
  assert.match(referenceQuery?.sql ?? "", /a\.status='activa'::miclub\.entity_status/);
  assert.match(referenceQuery?.sql ?? "", /a\.archived_at is null/);
  assert.deepEqual(referenceQuery?.params, [CLUB_A, PERSON_ID, ACTIVITY_ID]);
});

void test("rechaza actividades suspendidas, archivadas o pertenecientes a otro club", async () => {
  const fixtures: ActivityFixture[] = [
    { clubId: CLUB_A, personClubId: CLUB_A, status: "suspendida", archived: false, generatesEnrollments: true },
    { clubId: CLUB_A, personClubId: CLUB_A, status: "cancelada", archived: true, generatesEnrollments: true },
    { clubId: CLUB_B, personClubId: CLUB_A, status: "activa", archived: false, generatesEnrollments: true },
  ];

  for (const fixture of fixtures) {
    const state = installPool(fixture);
    assert.deepEqual(await createEnrollment(actor, input), { kind: "invalid_reference" });
    assert.equal(state.enrollments.length, 0);
  }
});

void test("rechaza una persona perteneciente a otro club", async () => {
  const state = installPool({ clubId: CLUB_A, personClubId: CLUB_B, status: "activa", archived: false, generatesEnrollments: true });

  assert.deepEqual(await createEnrollment(actor, input), { kind: "invalid_reference" });
  assert.equal(state.enrollments.length, 0);
});
