import type { OnboardingActivityDraft } from '@miclub/shared';

export const activitiesForSector = (activities: readonly OnboardingActivityDraft[], sectorClientId: string) =>
  activities.filter(activity => activity.sectorClientId === sectorClientId);

export const activitiesForInstructor = (activities: readonly OnboardingActivityDraft[], workerClientId: string) =>
  activities.filter(activity => (activity.responsibleWorkerClientId ?? activity.instructorClientId) === workerClientId);
