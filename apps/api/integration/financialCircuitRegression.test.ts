import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { FinancialCircuit } from '@miclub/shared';
import { assertIsolatedTestCluster } from '../src/db/testClusterGuard.js';

const controlUrl = process.env.MIGRATION_GATE_DATABASE_URL;
void test('DEC-017 circuito financiero HTTP y PostgreSQL aislado', { skip: !controlUrl, timeout: 120000 }, async t => {
  const control = new pg.Pool({ connectionString: controlUrl });
  try { await assertIsolatedTestCluster(control); } catch (error) { await control.end(); throw error; }
  const name = `finance_${randomBytes(6).toString('hex')}`;
  const url = new URL(controlUrl!); url.pathname = `/${name}`;
  await control.query(`create database ${name}`);
  const db = new pg.Pool({ connectionString: url.toString() });
  let server: import('node:http').Server | undefined;
  try {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', 'apps/api/src/scripts/runMigrations.ts'], { env: { ...process.env, ADMIN_DATABASE_URL: url.toString(), PGADMINROLE: '' }, maxBuffer: 4 * 1024 * 1024 });
    await db.query(await readFile('docs/dbeaver/2026-09-09-circuito-financiero.sql', 'utf8'));
    Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.toString(), ADMIN_DATABASE_URL: url.toString(), PUBLIC_APP_URL: 'http://localhost:5173', CORS_ORIGINS: 'http://localhost:5173', AUTH_ENABLED: 'true', PUBLIC_REGISTRATION_ENABLED: 'true', SESSION_SECRET: 'financial-regression-secret-32-characters', DATA_SOURCE: 'postgres', CRM_SOURCE: 'postgres' });
    const { app } = await import('../src/index.js');
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const request = async (route: string, body?: unknown, cookie?: string, key = randomUUID()) => {
      const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', 'idempotency-key': key, ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() as Record<string, unknown>, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    const register = async (suffix: string) => {
      const registered = await request('/auth/register', { firstName: 'Test', lastName: suffix, dni: suffix === 'A' ? '30111111' : '30222222', phone: '1123456789', email: `finance${suffix}@test.invalid`, password: 'FinancialTest123!', club: { name: `Financial ${suffix}` } });
      assert.equal(registered.status, 201, JSON.stringify(registered.body));
      const login = await request('/auth/login', { username: `finance${suffix}@test.invalid`, password: 'FinancialTest123!' });
      assert.equal(login.status, 200); assert.ok(login.cookie); return login.cookie;
    };
    const cookie = await register('A');
    const club = (await db.query<{ id: string }>('select id from miclub.clubs')).rows[0].id;
    const person = (await db.query<{ id: string }>('select id from miclub.people where club_id=$1', [club])).rows[0].id;
    const sector = (await db.query<{ id: string }>('select id from miclub.sectors where club_id=$1 limit 1', [club])).rows[0].id;
    const instructor = (await db.query<{ id: string }>("insert into miclub.instructors(club_id,person_id,display_name) values($1,$2,'Ana') returning id", [club, person])).rows[0].id;
    const activity = (await db.query<{ id: string }>("insert into miclub.activities(club_id,sector_id,instructor_id,name) values($1,$2,$3,'Arte') returning id", [club, sector, instructor])).rows[0].id;
    const term = (await db.query<{ id: string }>("insert into miclub.activity_terms(club_id,activity_id,mode,club_share_percentage,effective_from) values($1,$2,'VARIABLE',40,'2026-09-01') returning id", [club, activity])).rows[0].id;
    const account = (await db.query<{ id: string }>("insert into miclub.financial_accounts(club_id,code,name,currency_code) values($1,'TEST','Caja prueba','ARS') returning id", [club])).rows[0].id;
    const category = (await db.query<{ id: string }>("select id from miclub.movement_categories where club_id=$1 and name='Cuotas' limit 1", [club])).rows[0]?.id ?? (await db.query<{ id: string }>("select mc.id from miclub.movement_categories mc join miclub.category_catalog cc on cc.id=mc.catalog_id where mc.club_id=$1 and mc.direction='INGRESOS' and cc.classification='OPERATIONAL' limit 1", [club])).rows[0].id;
    const receipt = { movementDate: '2026-09-03', movementType: 'INGRESOS', accountId: account, categoryId: category, sectorId: sector, activityId: activity, personId: person, concept: 'Cuota de Arte', counterpartyText: 'Alumno', amount: 100000, operationalStatus: 'COMPLETADO' };
    const read = async () => {
      const result = await request('/api/finance/circuit', undefined, cookie);
      if (result.status !== 200) {
        const { loadCircuit } = await import('../src/services/financialCircuitService.js');
        await loadCircuit({ query: async <T>(sql: string, params?: unknown[]) => {
          try { return { rows: (await db.query(sql, params)).rows as T[] }; }
          catch (error) { throw new Error(`${(error as Error).message}: ${sql}`); }
        } }, { clubId: club, userId: person, personId: person, membershipId: person, role: 'DIRECTOR', permissions: ['sectors:any'], sectorIds: [], email: '', legacy: false });
      }
      assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body as unknown as FinancialCircuit;
    };
    let movementId = '';
    await t.test('cobro, aprobación, pago, replay y corrección a deuda 12000', async () => {
      const created = await request('/api/finance/movements', { reason: 'Cobro inicial', movement: receipt }, cookie);
      assert.equal(created.status, 201, JSON.stringify(created.body)); movementId = String(created.body.id);
      let circuit = await read();
      assert.equal(circuit.diagnostics.length, 0, JSON.stringify(circuit.diagnostics));
      let line = circuit.settlements.find(s => s.termId === term)!;
      assert.equal(line.balance, 60000);
      const approved = await request(`/api/finance/settlements/${line.id}/approve`, { revision: line.revision, reason: 'Revisado' }, cookie);
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      const key = randomUUID(); const payment = { accountId: account, amount: 60000, date: '2026-09-04', debtCollection: false, reason: 'Pago revisado' };
      const paid = await request(`/api/finance/responsibles/${person}/pay`, payment, cookie, key);
      assert.equal(paid.status, 200, JSON.stringify(paid.body));
      assert.deepEqual((await request(`/api/finance/responsibles/${person}/pay`, payment, cookie, key)).body, paid.body);
      const version = (await db.query<{ revision: number }>('select revision from miclub.movements where id=$1', [movementId])).rows[0].revision;
      const corrected = await request(`/api/finance/movements/${movementId}/correct`, { revision: version, movement: { ...receipt, amount: 80000 }, reason: 'Importe cargado incorrectamente' }, cookie);
      assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
      circuit = await read(); line = circuit.settlements.find(s => s.termId === term)!;
      assert.equal(line.balance, -12000); assert.equal(line.payments, 60000); assert.equal(line.reviewState, 'REQUIRES_REVIEW');
      assert.equal((await db.query('select * from miclub.settlement_reviews where club_id=$1', [club])).rows.length, 1);
      assert.ok((await db.query('select * from miclub.finance_history where club_id=$1 and entity_id=$2', [club, movementId])).rows.length > 0);
    });
    await t.test('devolución parcial limita acumulado y conserva receptor', async () => {
      const revision = (await db.query<{ revision: number }>('select revision from miclub.movements where id=$1', [movementId])).rows[0].revision;
      const refunded = await request(`/api/finance/movements/${movementId}/refund`, { revision, amount: 10000, accountId: account, date: '2026-09-05', reason: 'Baja parcial' }, cookie);
      assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
      assert.equal((await read()).settlements.find(s => s.termId === term)?.balance, -18000);
      const excessive = await request(`/api/finance/movements/${movementId}/refund`, { revision, amount: 75000, accountId: account, date: '2026-09-05', reason: 'Exceso' }, cookie);
      assert.equal(excessive.status, 409);
    });
    await t.test('aislamiento A/B en lectura, corrección, devolución y revisión', async () => {
      const other = await register('B');
      const readB = await request('/api/finance/circuit', undefined, other);
      assert.equal(readB.status, 200, JSON.stringify(readB.body));
      assert.equal((readB.body.settlements as unknown[]).length, 0);
      const revised = await request(`/api/finance/movements/${movementId}/correct`, { revision: 1, movement: receipt, reason: 'Referencia ajena' }, other);
      assert.equal(revised.status, 404);
      const refunded = await request(`/api/finance/movements/${movementId}/refund`, { revision: 1, amount: 1, accountId: account, date: '2026-09-05', reason: 'Ajeno' }, other);
      assert.equal(refunded.status, 404);
    });
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    const { closePostgresPool, closePostgresAdminPool } = await import('../src/db/postgres.js');
    await closePostgresPool(); await closePostgresAdminPool(); await db.end();
    await control.query(`drop database ${name} with (force)`); await control.end();
  }
});
