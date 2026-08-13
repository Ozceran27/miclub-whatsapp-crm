import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../db/migrations/202608130001_version_activity_terms.sql', import.meta.url);
const migration = () => readFile(migrationUrl, 'utf8');

test('los términos VARIABLE admiten los límites 0% y 100%, y rechazan fee fijo o porcentajes fuera de rango', async () => {
  const sql = await migration();
  assert.match(sql, /club_share_percentage BETWEEN 0 AND 100/);
  assert.match(sql, /mode='VARIABLE'.*monthly_fixed_fee IS NULL/s);
  assert.match(sql, /mode='FIXED'.*monthly_fixed_fee >= 0.*club_share_percentage IS NULL/s);
});

test('los cambios de términos no pueden superponerse y conservan las versiones anteriores', async () => {
  const sql = await migration();
  assert.match(sql, /EXCLUDE USING gist[\s\S]*activity_id WITH =[\s\S]*daterange[\s\S]*WITH &&/);
  assert.doesNotMatch(sql, /DELETE FROM miclub\.activity_terms/i);
  assert.match(sql, /activity_terms_no_overlap/);
});

test('tenant, archivo e historia quedan protegidos también en base de datos', async () => {
  const sql = await migration();
  assert.match(sql, /FOREIGN KEY \(activity_id, club_id\)[\s\S]*REFERENCES miclub\.activities\(id, club_id\)/);
  assert.match(sql, /cross-tenant sector/);
  assert.match(sql, /cross-tenant instructor/);
  assert.match(sql, /cross-tenant responsible/);
  assert.match(sql, /activity with movements, enrollments or historical terms must be archived/);
});

test('el diagnóstico precede al backfill y excluye los casos de revisión manual', async () => {
  const sql = await migration();
  const diagnosis = sql.indexOf('INSERT INTO miclub.activity_terms_migration_diagnostic');
  const backfill = sql.indexOf('INSERT INTO miclub.activity_terms\n');
  assert.ok(diagnosis >= 0 && backfill > diagnosis);
  assert.match(sql, /WHERE d\.diagnosis='READY'/);
  assert.match(sql, /MANUAL_REVIEW/);
});
