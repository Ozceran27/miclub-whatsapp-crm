import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardingActivityDraft } from '@miclub/shared';
import { activitiesForInstructor, activitiesForSector } from './draftDependencies';

const activities = [
  { name: 'Tenis', sectorClientId: 'sector-a', instructorClientId: 'worker-a' },
  { name: 'Natación', sectorClientId: 'sector-b', instructorClientId: 'worker-b' },
] as OnboardingActivityDraft[];

void test('identifica las actividades que impiden quitar un sector o instructor del borrador', () => {
  assert.deepEqual(activitiesForSector(activities, 'sector-a').map(item => item.name), ['Tenis']);
  assert.deepEqual(activitiesForInstructor(activities, 'worker-b').map(item => item.name), ['Natación']);
  assert.deepEqual(activitiesForSector(activities, 'sector-c'), []);
  assert.deepEqual(activitiesForInstructor(activities, 'worker-c'), []);
});
