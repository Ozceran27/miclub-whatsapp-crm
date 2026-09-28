import test from 'node:test';
import assert from 'node:assert/strict';
import type { PgPool } from '../db/postgres.js';
import { setPostgresPoolForTests } from '../db/postgres.js';
import { updateTemplate } from './crmRepository.js';

void test('editar una plantilla ausente no inserta otra ni cambia el club', async () => {
  const queries: string[] = [];
  const query = (sql: string) => {
    queries.push(sql);
    if (sql.includes('to_regclass')) return Promise.resolve({ rows: [{ ready: true }] });
    return Promise.resolve({ rows: [] });
  };
  const pool = { query, connect: () => Promise.resolve({ query, release: () => undefined }) } as unknown as PgPool;
  setPostgresPoolForTests(pool);
  try {
    const result = await updateTemplate('11111111-1111-4111-8111-111111111111', 'missing', 'Nombre', 'Cuerpo', new Date().toISOString());
    assert.equal(result, null);
    assert.ok(queries.some(sql => sql.includes('where club_id=$1 and id=$2 and archived_at is null')));
    assert.ok(queries.every(sql => !sql.includes('insert into miclub.crm_message_templates')));
  } finally {
    setPostgresPoolForTests(undefined);
  }
});
