/** Deterministic, non-production identities for authorization/IDOR contract tests. */
export const tenantFixture = {
  clubs: [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Club Norte' },
    { id: '20000000-0000-4000-8000-000000000002', name: 'Club Sur' }
  ],
  sectors: [
    { id: '11000000-0000-4000-8000-000000000001', clubId: '10000000-0000-4000-8000-000000000001', name: 'Tenis' },
    { id: '11000000-0000-4000-8000-000000000002', clubId: '10000000-0000-4000-8000-000000000001', name: 'Natación' },
    { id: '22000000-0000-4000-8000-000000000001', clubId: '20000000-0000-4000-8000-000000000002', name: 'Hockey' }
  ],
  users: [
    { id: '30000000-0000-4000-8000-000000000001', username: 'global.director' },
    { id: '30000000-0000-4000-8000-000000000002', username: 'sector.operator' },
    { id: '30000000-0000-4000-8000-000000000003', username: 'foreign.viewer' },
    { id: '30000000-0000-4000-8000-000000000004', username: 'no.membership' }
  ],
  memberships: [
    { id: '40000000-0000-4000-8000-000000000001', userId: '30000000-0000-4000-8000-000000000001', clubId: '10000000-0000-4000-8000-000000000001', role: 'director', permissions: ['*'], sectorIds: [] },
    { id: '40000000-0000-4000-8000-000000000002', userId: '30000000-0000-4000-8000-000000000001', clubId: '20000000-0000-4000-8000-000000000002', role: 'viewer', permissions: ['dashboard.read'], sectorIds: [] },
    { id: '40000000-0000-4000-8000-000000000003', userId: '30000000-0000-4000-8000-000000000002', clubId: '10000000-0000-4000-8000-000000000001', role: 'sector_operator', permissions: ['activities.view', 'activities.edit', 'tasks.view'], sectorIds: ['11000000-0000-4000-8000-000000000001'] },
    { id: '40000000-0000-4000-8000-000000000004', userId: '30000000-0000-4000-8000-000000000003', clubId: '20000000-0000-4000-8000-000000000002', role: 'viewer', permissions: ['activities.view'], sectorIds: ['22000000-0000-4000-8000-000000000001'] }
  ]
} as const;
