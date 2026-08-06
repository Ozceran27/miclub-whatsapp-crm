import { PERMISSIONS, type PermissionCode } from '@miclub/shared';
import type { ModuleId } from './modules/ModuleNav';

export const ADMINISTRATION_CAPABILITIES = {
  enter: [PERMISSIONS.ADMINISTRATION_VIEW], summary: [PERMISSIONS.ADMINISTRATION_VIEW],
  sectors: [PERMISSIONS.SECTORS_VIEW], activities: [PERMISSIONS.ACTIVITIES_VIEW], activityFinancials: [PERMISSIONS.FINANCE_READ],
  enrollments: [PERMISSIONS.ENROLLMENTS_VIEW], movements: [PERMISSIONS.FINANCE_READ], workers: [PERMISSIONS.WORKERS_VIEW],
  tasks: [PERMISSIONS.TASKS_VIEW], requests: [PERMISSIONS.REQUESTS_VIEW],
  createMovement: [PERMISSIONS.MOVEMENTS_CREATE, PERMISSIONS.FINANCE_READ, PERMISSIONS.SECTORS_VIEW, PERMISSIONS.ACTIVITIES_VIEW],
  createEnrollment: [PERMISSIONS.ENROLLMENTS_CREATE, PERMISSIONS.PEOPLE_READ, PERMISSIONS.ACTIVITIES_VIEW],
  createTask: [PERMISSIONS.TASKS_CREATE], editTask: [PERMISSIONS.TASKS_EDIT],
  approveRequest: [PERMISSIONS.REQUESTS_APPROVE], rejectRequest: [PERMISSIONS.REQUESTS_REJECT],
} as const satisfies Record<string, readonly PermissionCode[]>;

export type AdministrationCapability = keyof typeof ADMINISTRATION_CAPABILITIES;
export const hasAdministrationCapability = (permissions: readonly string[], capability: AdministrationCapability) =>
  ADMINISTRATION_CAPABILITIES[capability].every((permission) => permissions.includes(permission));
export const getAdministrationCapabilities = (permissions: readonly string[]) => {
  const canEnter = hasAdministrationCapability(permissions, 'enter');
  return Object.fromEntries(
    (Object.keys(ADMINISTRATION_CAPABILITIES) as AdministrationCapability[])
      .map((capability) => [capability, canEnter && hasAdministrationCapability(permissions, capability)]),
  ) as Record<AdministrationCapability, boolean>;
};
export const visibleModules = <T extends { id: ModuleId }>(modules: readonly T[], permissions: readonly string[]) =>
  modules.filter(({ id }) => id !== 'administration' || hasAdministrationCapability(permissions, 'enter'));
