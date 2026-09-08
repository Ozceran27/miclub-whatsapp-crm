import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalizeMigrationSql, cleanInstallBaseline, installationManifest, migrationManifest } from './migrationManifest.js';

void test('fresh baseline has a verified checksum and no invented legacy ledger', async () => {
  const sql=canonicalizeMigrationSql(await readFile(new URL('../../db/baselines/202609080001_clean_install.sql', import.meta.url),'utf8'));
  assert.equal(createHash('sha256').update(sql).digest('hex'),cleanInstallBaseline.sha256);
  assert.equal(installationManifest([])[0],cleanInstallBaseline);
  assert.doesNotMatch(sql,/^INSERT INTO miclub\.(users|people|clubs|movements|enrollments)\s*\(/im);
  assert.doesNotMatch(sql,/INSERT INTO public\.miclub_schema_migrations/i);
});
void test('legacy, baseline, unknown, tampered and noncontiguous histories are distinct', () => {
  const row=(entry:typeof cleanInstallBaseline)=>({name:entry.path.split('/').at(-1)!,checksum:entry.sha256});
  assert.equal(installationManifest([row(migrationManifest[0])]),migrationManifest);
  assert.equal(installationManifest([row(cleanInstallBaseline)])[0],cleanInstallBaseline);
  assert.throws(()=>installationManifest([row(cleanInstallBaseline),row(migrationManifest[0])]));
  assert.throws(()=>installationManifest([row(migrationManifest[1])]));
  assert.throws(()=>installationManifest([{name:'unknown.sql',checksum:'x'}]));
  assert.throws(()=>installationManifest([{...row(cleanInstallBaseline),checksum:'x'}]));
});
