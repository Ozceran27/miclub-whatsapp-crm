import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertActivity } from './activitiesRepository.js';
import { archiveActivity, createActivity, setActivityStatus, updateActivity, type ActivityActor, type ActivityInput } from './activitiesRepository.js';
import { setPostgresPoolForTests, type PgClient, type PgPool } from '../db/postgres.js';

const CLUB_A = '11111111-1111-4111-8111-111111111111';
const CLUB_B = '22222222-2222-4222-8222-222222222222';
const SECTOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECTOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EMPLOYEE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PERSON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INSTRUCTOR_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const UPDATED_AT = '2026-08-05T12:00:00.000Z';
const limitedActor: ActivityActor = { userId: 'user-limited', membershipId: 'membership-limited', clubId: CLUB_A, sectorIds: [SECTOR_A], canAccessAnySector: false };
const anySectorActor: ActivityActor = { ...limitedActor, userId: 'user-any', membershipId: 'membership-any', sectorIds: [], canAccessAnySector: true };
const input = (sectorId: string): ActivityInput => ({ sectorId, responsibleEmployeeId: EMPLOYEE_ID, name: 'Natación', managerPersonId: null, clubCommissionPercent: 10, status: 'inactive', settlement: { mode: 'VARIABLE', fixedFeeFrequency: null,currencyCode:null, fixedClubFee: null, clubSharePercentage: 10, effectiveFrom: '2026-09-01' } });

type StoredActivity = { id: string; club_id: string; sector_id: string; manager_person_id: string | null; instructor_id?: string | null; responsible_employee_id?: string | null; updated_at: string; archived_at: null };
const installActivityPool = (stored: StoredActivity, settlementLocked = false) => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('set_config')) return { rows: [] };
      if (sql.includes('miclub_schema_migrations')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('pg_attribute')) return { rows: [{ available: true }] };
      if (sql.includes('pg_proc')) return { rows: [{ available: true }] };
      if (sql.includes('from miclub.activities') && sql.includes('for update')) {
        const sectors = params?.[3] as string[];
        const visible = stored.club_id === params?.[0] && stored.id === params?.[1]
          && (params?.[2] === true || sectors.includes(stored.sector_id));
        return { rows: visible ? [stored] : [] };
      }
      if (sql.includes('select exists(select 1 from miclub.sectors')) return { rows: [{ sector: true, manager: true, responsible: true, employee_id: EMPLOYEE_ID, employee_person_id: PERSON_ID, legacy_instructor_id: INSTRUCTOR_ID }] };
      if (sql.includes('from miclub.activity_terms') && sql.includes('for update')) return { rows: [{ id: 'term-1', effective_from: '2026-08-01', effective_to: null }] };
      if (sql.includes('from miclub.activity_settlements')) return { rows: [{ locked: settlementLocked }] };
      if (sql.includes('update miclub.activity_terms')) return { rows: [{ id: 'term-1', effective_from: '2026-08-01', effective_to: '2026-08-31' }] };
      if (sql.includes('insert into miclub.activity_terms')) return { rows: [{ id: 'term-2', effective_from: '2026-09-01', effective_to: null }] };
      if (sql.includes('from miclub.enrollments')) return { rows: [{ enrollments: 0, movements: 0 }] };
      if (sql.includes('update miclub.activities')) return { rows: [{ ...stored, sector_id: params?.[2] ?? stored.sector_id, updated_at: '2026-08-05T12:01:00.000Z' }] };
      if (sql.includes('INSERT INTO miclub.audit_log')) return { rows: [{ id: 'audit-1' }] };
      throw new Error(`SQL inesperado: ${sql}`);
    },
    release: () => undefined,
  } as PgClient;
  setPostgresPoolForTests({ connect: async () => client, query: client.query, end: async () => undefined } as PgPool);
  return queries;
};

test.afterEach(() => setPostgresPoolForTests(undefined));

const createPool = (settlement: ActivityInput['settlement'], failAudit = false, injected?: { target: 'activity'|'term'; error: Error }, canonicalGuard = true) => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client = { query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('set_config')) return { rows: [] };
    if (sql.includes('miclub_schema_migrations')) return { rows: [{}] };
    if (sql.includes('pg_attribute')) return { rows: [{ available: true }] };
    if (sql.includes('pg_proc')) return { rows: [{ available: canonicalGuard }] };
    if (sql.includes('select exists(select 1 from miclub.sectors')) return { rows: [{ sector: true, manager: true, responsible: true, employee_id: EMPLOYEE_ID, employee_person_id: PERSON_ID, legacy_instructor_id: INSTRUCTOR_ID }] };
    if (sql.includes('insert into miclub.activities')) { if (injected?.target === 'activity') throw injected.error; return { rows: [{ id: ACTIVITY_ID, updated_at: UPDATED_AT }] }; }
    if (sql.includes('insert into miclub.activity_terms')) { if (injected?.target === 'term') throw injected.error; return { rows: [{ id: 'term-created', effective_from: settlement.effectiveFrom, effective_to: null }] }; }
    if (sql.includes('INSERT INTO miclub.audit_log')) {
      if (failAudit) throw new Error('audit unavailable');
      return { rows: [{ id: 'audit-1' }] };
    }
    throw new Error(`SQL inesperado: ${sql}`);
  }, release: () => undefined } as PgClient;
  setPostgresPoolForTests({ connect: async () => client, query: client.query, end: async () => undefined } as PgPool);
  return queries;
};

for (const settlement of [
  { mode: 'FIXED', fixedFeeFrequency: 'MONTHLY',currencyCode:"ARS", fixedClubFee: 125000, clubSharePercentage: null, effectiveFrom: '2026-09-01' } as const,
  { mode: 'VARIABLE', fixedFeeFrequency: null,currencyCode:null, fixedClubFee: null, clubSharePercentage: 35.5, effectiveFrom: '2026-10-15' } as const,
]) test(`crea actividad y primer término ${settlement.mode} con su vigencia`, async () => {
  const queries = createPool(settlement);
  const result = await createActivity(limitedActor, { ...input(SECTOR_A), settlement });
  assert.equal(result.kind, 'created');
  const insert = queries.find(({ sql }) => sql.includes('insert into miclub.activity_terms'));
  assert.deepEqual(insert?.params?.slice(2, 7), [settlement.mode, settlement.fixedClubFee, settlement.fixedFeeFrequency, settlement.currencyCode, settlement.clubSharePercentage]);
  assert.equal(insert?.params?.[9], settlement.effectiveFrom);
  assert.equal(queries.filter(({ sql }) => sql.includes('INSERT INTO miclub.audit_log')).length, 2, 'audita actividad y término');
  const references = queries.find(({ sql }) => sql.includes('select exists(select 1 from miclub.sectors'));
  assert.match(references?.sql ?? '', /miclub\.instructors[\s\S]*status='activa'/);
  assert.doesNotMatch(references?.sql ?? '', /is_active/);
  assert.equal(queries.some(({ sql }) => sql.includes('miclub_schema_migrations')), false, 'la instalación manual se detecta por capacidad estructural');
  assert.equal(queries.at(-1)?.sql, 'COMMIT');
});

test('revierte atómicamente actividad y término cuando falla la auditoría', async () => {
  const settlement = { mode: 'FIXED', fixedFeeFrequency: 'MONTHLY',currencyCode:"ARS", fixedClubFee: 100, clubSharePercentage: null, effectiveFrom: '2026-09-01' } as const;
  const queries = createPool(settlement, true);
  await assert.rejects(createActivity(limitedActor, { ...input(SECTOR_A), settlement }), /audit unavailable/);
  assert.equal(queries.some(({ sql }) => sql === 'ROLLBACK'), true);
  assert.equal(queries.some(({ sql }) => sql === 'COMMIT'), false);
});

test('no presenta un CHECK operativo como si fuera un solapamiento económico', async () => {
  const settlement = input(SECTOR_A).settlement;
  const operationalError = Object.assign(new Error('active activity requires responsible_employee_id'), { code: '23514', constraint: 'activities_new_writes_require_responsible_employee' });
  createPool(settlement, false, { target: 'activity', error: operationalError });
  await assert.rejects(createActivity(limitedActor, { ...input(SECTOR_A), settlement }), /requires responsible_employee_id/);

  const termError = Object.assign(new Error('violates activity terms'), { code: '23514', constraint: 'activity_terms_values_check' });
  createPool(settlement, false, { target: 'term', error: termError });
  assert.deepEqual(await createActivity(limitedActor, { ...input(SECTOR_A), settlement }), { kind: 'invalid_terms' });
});

test('falla cerrado antes de escribir cuando PostgreSQL conserva la guarda legacy de Instructor', async () => {
  const settlement = input(SECTOR_A).settlement;
  const queries = createPool(settlement, false, undefined, false);
  assert.deepEqual(await createActivity(limitedActor, { ...input(SECTOR_A), settlement }), { kind: 'model_not_applied' });
  assert.equal(queries.some(({ sql }) => sql.includes('insert into miclub.activities')), false);
});

test('upsertActivity permite que una importación normalizada baje monthly_fee y audita el cambio', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'activity-1' }] };
    },
  };

  const id = await upsertActivity(pool as never, { clubId: "club-1",
    sectorId: 'sector-1',
    name: 'Musculación',
    modality: 'Mensual',
    instructorId: 'instructor-1',
    monthlyFee: 30000,
    monthlyFeeSource: 'xlsx_import',
    monthlyFeeRawText: '300000',
    monthlyFeeRawAmount: 300000,
    monthlyFeeNormalizationReason: 'scale_adjustment:300000->30000',
    importBatchId: '00000000-0000-0000-0000-000000000001',
  });

  assert.equal(id, 'activity-1');
  const query = queries[0];
  assert.ok(query, 'expected upsert query');
  assert.equal(query.params?.[5], 30000);
  assert.equal(query.params?.[7], true, 'expected monthly fee update to be enabled for normalized imports');
  assert.equal(query.params?.[10], '300000');
  assert.equal(query.params?.[11], 300000);
  assert.equal(query.params?.[12], 'scale_adjustment:300000->30000');
  assert.match(query.sql, /monthly_fee = case\s+when \$8::boolean then excluded\.monthly_fee\s+else miclub\.activities\.monthly_fee/s);
  assert.match(query.sql, /insert into miclub\.activity_fee_history/);
  assert.match(query.sql, /responsible_employee_id/);
  assert.match(query.sql, /join miclub\.employees e on e\.club_id=i\.club_id and e\.person_id=i\.person_id/);
  assert.match(query.sql, /lower\(name\) = lower\(\$3\)/);
  assert.match(query.sql, /on conflict \(club_id, sector_id, lower\(name\), coalesce\(modality, ''::text\)\)/);
  assert.doesNotMatch(query.sql, /greatest\(miclub\.activities\.monthly_fee, excluded\.monthly_fee\)/);
});

for (const settlement of [
  { mode: 'VARIABLE', fixedFeeFrequency: null,currencyCode:null, fixedClubFee: null, clubSharePercentage: 42, effectiveFrom: '2026-09-01' } as const,
  { mode: 'FIXED', fixedFeeFrequency: 'MONTHLY',currencyCode:"ARS", fixedClubFee: 250000, clubSharePercentage: null, effectiveFrom: '2026-09-01' } as const,
]) test(`versiona un cambio de ${settlement.mode === 'FIXED' ? 'monto' : 'porcentaje'} sin reescribir el término vigente`, async () => {
  const stored = { id: ACTIVITY_ID, club_id: CLUB_A, sector_id: SECTOR_A, manager_person_id: null, responsible_employee_id: EMPLOYEE_ID, updated_at: UPDATED_AT, archived_at: null };
  const queries = installActivityPool(stored);
  assert.equal((await updateActivity(limitedActor, ACTIVITY_ID, UPDATED_AT, { ...input(SECTOR_A), settlement })).kind, 'updated');
  const close = queries.find(({ sql }) => sql.includes('update miclub.activity_terms'));
  assert.match(close?.sql ?? '', /effective_to=\$3::date - 1/);
  assert.equal(close?.params?.[2], settlement.effectiveFrom);
  const insert = queries.find(({ sql }) => sql.includes('insert into miclub.activity_terms'));
  assert.deepEqual(insert?.params?.slice(2, 7), [settlement.mode, settlement.fixedClubFee, settlement.fixedFeeFrequency, settlement.currencyCode, settlement.clubSharePercentage]);
  assert.equal(insert?.params?.[8], settlement.effectiveFrom);
});

test('rechaza vigencias solapadas y preserva historia liquidada antes de escribir la actividad', async () => {
  const stored = { id: ACTIVITY_ID, club_id: CLUB_A, sector_id: SECTOR_A, manager_person_id: null, responsible_employee_id: EMPLOYEE_ID, updated_at: UPDATED_AT, archived_at: null };
  let queries = installActivityPool(stored);
  assert.equal((await updateActivity(limitedActor, ACTIVITY_ID, UPDATED_AT, { ...input(SECTOR_A), settlement: { ...input(SECTOR_A).settlement, effectiveFrom: '2026-08-01' } })).kind, 'invalid_terms');
  assert.equal(queries.some(({ sql }) => sql.includes('update miclub.activities')), false);

  queries = installActivityPool(stored, true);
  assert.equal((await updateActivity(limitedActor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_A))).kind, 'settled_history');
  assert.equal(queries.some(({ sql }) => sql.includes('update miclub.activities')), false);
});

test('upsertActivity no pisa monthly_fee cuando la cuota del import viene en blanco', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'activity-1' }] };
    },
  };

  await upsertActivity(pool as never, { clubId: "club-1",
    sectorId: 'sector-1',
    name: 'Musculación',
    instructorId: 'instructor-1',
  });

  assert.equal(queries[0]?.params?.[7], false, 'blank import fee must not overwrite the stored activity fee');
});

test('el usuario limitado no puede hacer update, status ni archive en el segundo sector, pero sectors:any sí', async () => {
  const stored = { id: ACTIVITY_ID, club_id: CLUB_A, sector_id: SECTOR_B, manager_person_id: null, responsible_employee_id: EMPLOYEE_ID, updated_at: UPDATED_AT, archived_at: null };
  const operations = [
    (actor: ActivityActor) => updateActivity(actor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_B)),
    (actor: ActivityActor) => setActivityStatus(actor, ACTIVITY_ID, UPDATED_AT, 'inactive'),
    (actor: ActivityActor) => archiveActivity(actor, ACTIVITY_ID, UPDATED_AT),
  ];

  for (const operation of operations) {
    const deniedQueries = installActivityPool(stored);
    assert.deepEqual(await operation(limitedActor), { kind: 'missing' });
    assert.equal(deniedQueries.some(({ sql }) => sql.includes('update miclub.activities')), false);

    installActivityPool(stored);
    assert.equal((await operation(anySectorActor)).kind, 'updated');
  }
});

test('una reasignación exige acceso simultáneo al sector actual y al destino', async () => {
  const stored = { id: ACTIVITY_ID, club_id: CLUB_A, sector_id: SECTOR_A, manager_person_id: null, responsible_employee_id: EMPLOYEE_ID, updated_at: UPDATED_AT, archived_at: null };
  const deniedQueries = installActivityPool(stored);
  assert.deepEqual(await updateActivity(limitedActor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_B)), { kind: 'missing' });
  assert.equal(deniedQueries.some(({ sql }) => sql.includes('select exists(select 1 from miclub.sectors')), false, 'no debe confirmar si el destino existe');
  assert.equal(deniedQueries.some(({ sql }) => sql.includes('update miclub.activities')), false);

  installActivityPool(stored);
  const bothSectorsActor = { ...limitedActor, sectorIds: [SECTOR_A, SECTOR_B] };
  assert.equal((await updateActivity(bothSectorsActor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_B))).kind, 'updated');

  installActivityPool(stored);
  assert.equal((await updateActivity(anySectorActor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_B))).kind, 'updated');
});

test('update, status, archive y reasignación ocultan actividades de otro club para ambos alcances', async () => {
  const foreign = { id: ACTIVITY_ID, club_id: CLUB_B, sector_id: SECTOR_A, manager_person_id: null, updated_at: UPDATED_AT, archived_at: null };
  const operations = [
    (actor: ActivityActor) => updateActivity(actor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_A)),
    (actor: ActivityActor) => setActivityStatus(actor, ACTIVITY_ID, UPDATED_AT, 'inactive'),
    (actor: ActivityActor) => archiveActivity(actor, ACTIVITY_ID, UPDATED_AT),
    (actor: ActivityActor) => updateActivity(actor, ACTIVITY_ID, UPDATED_AT, input(SECTOR_B)),
  ];

  for (const actor of [limitedActor, anySectorActor]) {
    for (const operation of operations) {
      const queries = installActivityPool(foreign);
      assert.deepEqual(await operation(actor), { kind: 'missing' });
      const lookup = queries.find(({ sql }) => sql.includes('from miclub.activities') && sql.includes('for update'));
      assert.deepEqual(lookup?.params?.slice(0, 2), [CLUB_A, ACTIVITY_ID]);
      assert.match(lookup?.sql ?? '', /club_id=\$1 and id=\$2/);
      assert.equal(queries.some(({ sql }) => sql.includes('update miclub.activities')), false);
    }
  }
});
