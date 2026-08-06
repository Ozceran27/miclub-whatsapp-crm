import assert from 'node:assert/strict';
import test from 'node:test';
import { KNOWN_PERMISSIONS, PERMISSIONS } from '@miclub/shared';
import { getAdministrationCapabilities, visibleModules, type AdministrationCapability } from '../administrationCapabilities';
import type { ModuleDefinition } from './ModuleNav';

const modules: ModuleDefinition[] = [{ id: 'home', label: 'Inicio' }, { id: 'administration', label: 'Administración' }];
const readRequests: Partial<Record<AdministrationCapability, string>> = {
  summary: '/api/administration/summary', sectors: '/api/sectores', activities: '/api/actividades',
  activityFinancials: '/api/economy/activity-rankings', enrollments: '/api/inscripciones', movements: '/api/movimientos',
  workers: '/api/administration/workers', tasks: '/api/tasks', requests: '/api/requests',
};

const invokedFor = (permissions: readonly string[]) => {
  const capabilities = getAdministrationCapabilities(permissions);
  return Object.entries(readRequests).flatMap(([capability, endpoint]) => capabilities[capability as AdministrationCapability] ? [endpoint] : []);
};

test('una membresía administrativa completa ve navegación y puede consultar todas las superficies', () => {
  assert.deepEqual(visibleModules(modules, KNOWN_PERMISSIONS).map(({ id }) => id), ['home', 'administration']);
  assert.deepEqual(invokedFor(KNOWN_PERMISSIONS), Object.values(readRequests));
});

test('una membresía parcial sólo habilita e invoca los endpoints concedidos', () => {
  const permissions = [PERMISSIONS.ADMINISTRATION_VIEW, PERMISSIONS.SECTORS_VIEW, PERMISSIONS.TASKS_VIEW];
  assert.deepEqual(visibleModules(modules, permissions).map(({ id }) => id), ['home', 'administration']);
  assert.deepEqual(invokedFor(permissions), ['/api/administration/summary', '/api/sectores', '/api/tasks']);
});

test('sin administration.view oculta navegación y no habilita ningún endpoint administrativo', () => {
  const permissions = [PERMISSIONS.SECTORS_VIEW, PERMISSIONS.TASKS_VIEW];
  const capabilities = getAdministrationCapabilities(permissions);
  assert.deepEqual(visibleModules(modules, permissions).map(({ id }) => id), ['home']);
  assert.equal(capabilities.enter, false);
  assert.deepEqual(invokedFor(permissions), []);
});
