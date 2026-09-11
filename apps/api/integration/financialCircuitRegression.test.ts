import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import type { FinancialCircuit } from '@miclub/shared';
import { assertIsolatedTestCluster } from '../src/db/testClusterGuard.js';

const controlUrl = process.env.MIGRATION_GATE_DATABASE_URL;
const visual = process.env.FINANCIAL_VISUAL_REVIEW === 'true';
void test('DEC-017 circuito financiero HTTP y PostgreSQL aislado', { skip: !controlUrl, timeout: visual ? 900000 : 120000 }, async t => {
  const control = new pg.Pool({ connectionString: controlUrl });
  try { await assertIsolatedTestCluster(control); } catch (error) { await control.end(); throw error; }
  const name = `finance_${randomBytes(6).toString('hex')}`;
  const url = new URL(controlUrl!); url.pathname = `/${name}`;
  await control.query(`create database ${name}`);
  const db = new pg.Pool({ connectionString: url.toString() });
  let server: import('node:http').Server | undefined;
  try {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', 'apps/api/src/scripts/runMigrations.ts'], { env: { ...process.env, ADMIN_DATABASE_URL: url.toString(), PGADMINROLE: '' }, maxBuffer: 4 * 1024 * 1024 });
    const manualSql = await readFile('docs/dbeaver/2026-09-09-circuito-financiero.sql', 'utf8');
    // Reproduce the reported partially applied installation, in this disposable DB only.
    await db.query("delete from public.miclub_schema_migrations where name in ('202609090002_financial_operating_circuit.sql','202609090003_initial_obligation_applications.sql')");
    await db.query('alter table miclub.initial_obligations drop column review_state');
    await db.query(manualSql);
    await db.query(manualSql);
    Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.toString(), ADMIN_DATABASE_URL: url.toString(), PUBLIC_APP_URL: 'http://localhost:5173', CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5189', AUTH_ENABLED: 'true', PUBLIC_REGISTRATION_ENABLED: 'true', SESSION_SECRET: 'financial-regression-secret-32-characters', DATA_SOURCE: 'postgres', CRM_SOURCE: 'postgres' });
    const { app } = await import('../src/index.js');
    const host = express();
    if (visual) host.use(express.static(path.resolve('apps/web/dist')));
    if (visual) host.get(['/','/login','/app','/app/:module'], (_req,res) => res.sendFile(path.resolve('apps/web/dist/index.html')));
    host.use(app);
    server = host.listen(visual ? 5189 : 0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve));
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
        } }, { clubId: club, permissions: ['sectors:any'], sectorIds: [] });
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
    await t.test('cuota parcialmente prevista sólo agrega el remanente a estimación futura', async () => {
      const due = (await db.query<{id: string}>("insert into miclub.receivables(club_id,person_id,activity_id,sector_id,concept,amount,due_date,currency_code) values($1,$2,$3,$4,'Cuota parcial',10000,'2026-09-09','ARS') returning id", [club, person, activity, sector])).rows[0].id;
      const pending = await request('/api/finance/movements', { reason: 'Cobro comprometido parcial', movement: { ...receipt, amount: 4000, operationalStatus: 'PENDIENTE', receivableId: due } }, cookie);
      assert.equal(pending.status, 201, JSON.stringify(pending.body));
      const projection = (await read()).projection;
      assert.equal(projection.pendingCollections, 4000);
      assert.equal(projection.expectedSettlements, 2400);
      assert.equal(projection.additionalClubReceivables, 2400);
      assert.equal(projection.futureEstimate! - projection.projectedBalance!, 2400);
    });
    await t.test('pagos concurrentes no superan el saldo neto revisado', async () => {
      const created = await request('/api/finance/movements', { reason: 'Nuevo cobro', movement: receipt }, cookie);
      assert.equal(created.status, 201);
      const line = (await read()).settlements.find(s => s.termId === term)!;
      assert.equal(line.balance, 42000);
      assert.equal((await request(`/api/finance/settlements/${line.id}/approve`, { revision: line.revision, reason: 'Revisión de saldo neto' }, cookie)).status, 200);
      const payment = { accountId: account, amount: 30000, date: '2026-09-06', reason: 'Pago concurrente' };
      const results = await Promise.all([request(`/api/finance/responsibles/${person}/pay`, payment, cookie), request(`/api/finance/responsibles/${person}/pay`, payment, cookie)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal((await read()).settlements.find(s => s.termId === term)?.balance, 12000);
    });
    await t.test('corte conserva saldo aprobado frente a correcciones históricas', async () => {
      const historical = { ...receipt, movementDate: '2026-09-01', amount: 10000 };
      const created = await request('/api/finance/movements', { reason: 'Historia anterior', movement: historical }, cookie);
      assert.equal(created.status, 201);
      const accounts = (await db.query<{id: string}>("select id from miclub.financial_accounts where club_id=$1 and status='ACTIVE'", [club])).rows.map(a => ({ accountId: a.id, amount: a.id === account ? 1000 : 0 }));
      const preview = await request('/api/finance/startup/preview', { mode: 'CUTOFF', cutoffDate: '2026-09-02', accounts, obligations: [{ sourceKey: 'yoga-debt', personId: person, activityId: activity, kind: 'RESPONSIBLE', currencyCode: 'ARS', amount: -12000, dueDate: '2026-08-31' }], reason: 'Conciliar arranque' }, cookie);
      assert.equal(preview.status, 200, JSON.stringify(preview.body));
      const approved = await request('/api/finance/startup/approve', { revision: preview.body.revision, acceptDifferences: true, reason: 'Diferencia verificada' }, cookie);
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      const before = (await read()).projection.liquidity;
      assert.equal((await read()).settlements.find(s => s.termId === term)?.payments, 90000);
      const corrected = await request(`/api/finance/movements/${String(created.body.id)}/correct`, { revision: 1, movement: { ...historical, amount: 20000 }, reason: 'Corrección anterior al corte' }, cookie);
      assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
      assert.equal((await read()).projection.liquidity, before);
      assert.equal((await db.query<{status: string}>('select status from miclub.finance_startups where club_id=$1', [club])).rows[0].status, 'REQUIRES_REVIEW');
    });
    await t.test('deuda inicial 12000 compensa saldo 30000 y paga sólo 18000 sin caja ficticia', async () => {
      assert.equal((await request('/api/finance/movements', { reason: 'Cobro posterior', movement: { ...receipt, amount: 30000 } }, cookie)).status, 201);
      const line = (await read()).settlements.find(s => s.termId === term)!;
      assert.equal(line.balance, 30000);
      assert.equal((await request(`/api/finance/settlements/${line.id}/approve`, { revision: line.revision, reason: 'Saldo revisado' }, cookie)).status, 200);
      const cashBefore = (await read()).projection.liquidity!;
      const paid = await request(`/api/finance/responsibles/${person}/pay`, { accountId: account, amount: 18000, date: '2026-09-08', reason: 'Compensar deuda de arranque' }, cookie);
      assert.equal(paid.status, 200, JSON.stringify(paid.body));
      const after = await read();
      assert.equal(after.settlements.filter(s => s.personId === person).reduce((sum, s) => sum + s.balance, 0), 0);
      assert.equal(cashBefore - after.projection.liquidity!, 18000);
      assert.equal((await db.query<{amount: number}>('select amount::float8 amount from miclub.settlement_compensations where club_id=$1 and debt_initial_obligation_id is not null', [club])).rows[0].amount, 12000);
    });
    await t.test('corregir y anular devolución conserva aplicaciones y cancelación proporcional', async () => {
      const due = (await db.query<{id: string}>("insert into miclub.receivables(club_id,person_id,activity_id,sector_id,concept,amount,due_date,currency_code) values($1,$2,$3,$4,'Cuota devolución',100000,'2026-09-09','ARS') returning id", [club, person, activity, sector])).rows[0].id;
      const created = await request('/api/finance/movements', { reason: 'Cobro aplicado', movement: { ...receipt, receivableId: due }, applications: [{ receivableId: due, amount: 100000 }] }, cookie);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const refunded = await request(`/api/finance/movements/${String(created.body.id)}/refund`, { revision: 1, amount: 40000, accountId: account, date: '2026-09-07', reason: 'Devolución parcial' }, cookie);
      assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
      const expenseCategory = (await db.query<{id: string}>("select id from miclub.movement_categories where club_id=$1 and direction='EGRESOS' and is_active limit 1", [club])).rows[0].id;
      const refundInput = { ...receipt, movementType: 'EGRESOS', categoryId: expenseCategory, movementDate: '2026-09-07', amount: 20000 };
      for (const [revision, status, cancelled, paid] of [[1, 'COMPLETADO', 20000, 80000], [2, 'ANULADO', 0, 100000]] as const) {
        const corrected = await request(`/api/finance/movements/${String(refunded.body.id)}/correct`, { revision, movement: { ...refundInput, operationalStatus: status }, reason: 'Corregir devolución registrada' }, cookie);
        assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
        const row = (await db.query<{cancelled: number; paid: number}>(`select r.cancelled_amount::float8 cancelled,(select sum(a.amount)::float8 from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id) paid from miclub.receivables r where r.club_id=$1 and r.id=$2`, [club, due])).rows[0];
        assert.equal(row.cancelled, cancelled); assert.equal(row.paid, paid);
      }
    });
    await t.test('pago parcial e idempotente de obligación inicial de proveedor', async () => {
      const obligation = (await db.query<{id:string}>("insert into miclub.initial_obligations(club_id,person_id,kind,currency_code,amount,source_key,due_date) values($1,$2,'SUPPLIER','ARS',100,'supplier-test','2026-08-31') returning id", [club,person])).rows[0].id;
      const key = randomUUID(); const input = { accountId: account, amount: 40, date: '2026-09-09', reason: 'Pago parcial proveedor' };
      const paid = await request(`/api/finance/initial-obligations/${obligation}/pay`, input, cookie, key);
      assert.equal(paid.status, 200, JSON.stringify(paid.body)); assert.equal(paid.body.remaining, 60);
      assert.deepEqual((await request(`/api/finance/initial-obligations/${obligation}/pay`, input, cookie, key)).body, paid.body);
      assert.equal((await request(`/api/finance/initial-obligations/${obligation}/pay`, {...input,amount:61},cookie)).status,409);
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
    await t.test('schema incompleto informa actualización y reparación conserva saldos', async () => {
      const before = await read();
      await db.query('alter table miclub.initial_obligations drop column review_state');
      const missing = await request('/api/finance/circuit', undefined, cookie);
      assert.equal(missing.status, 503); assert.equal(missing.body.code, 'FINANCIAL_SCHEMA_REQUIRED');
      await db.query(manualSql);
      const after = await read();
      assert.deepEqual(after.settlements.map(s => [s.id,s.balance]), before.settlements.map(s => [s.id,s.balance]));
      await db.query('alter table miclub.activity_terms alter column revision drop not null');
      await assert.rejects(db.query(manualSql), /Columna incompatible/);
      await db.query('rollback');
      await db.query('alter table miclub.activity_terms alter column revision set not null');
    });
    await t.test('recursos integrados de Economía y herramientas financieras responden', async () => {
      for (const endpoint of ['summary','monthly-evolution','by-sector','by-category','sector-rankings','payment-methods','recent-movements','pending','annual-summary','comparison','insights','yearly-breakdown']) {
        const response = await request(`/api/economy/${endpoint}`, undefined, cookie);
        assert.equal(response.status, 200, `${endpoint}: ${JSON.stringify(response.body)}`);
      }
      assert.equal((await request('/api/finance/workbench', undefined, cookie)).status, 200);
    });
    if (visual) {
      await db.query("update miclub.club_onboarding set status='COMPLETED',completed_at=now() where club_id=$1", [club]);
      console.log('VISUAL_READY http://127.0.0.1:5189/login');
      while (!existsSync('.local-evidence/financial-visual-stop')) await new Promise(resolve => setTimeout(resolve,1000));
    }
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    const { closePostgresPool, closePostgresAdminPool } = await import('../src/db/postgres.js');
    await closePostgresPool(); await closePostgresAdminPool(); await db.end();
    await control.query(`drop database ${name} with (force)`); await control.end();
  }
});
