import assert from 'node:assert/strict';
import test from 'node:test';
import { readSessionTenant, tenantModuleKey } from './tenantScope';

test('al alternar Club A/Club B no se reutiliza la instancia con contenido del tenant anterior', () => {
  const clubA = readSessionTenant({ clubId: 'club-a', membershipId: 'membership-a' });
  const clubB = readSessionTenant({ clubId: 'club-b', membershipId: 'membership-b' });

  const clubAInstance = tenantModuleKey(clubA.clubId, 'economy');
  const clubBInstance = tenantModuleKey(clubB.clubId, 'economy');

  assert.notEqual(clubAInstance, clubBInstance);
  assert.deepEqual(clubB, { clubId: 'club-b', membershipId: 'membership-b' });
  assert.equal(clubBInstance.includes('club-a'), false);
});
