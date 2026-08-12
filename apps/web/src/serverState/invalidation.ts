import { queryClient } from './client';

const MOVEMENT_RESOURCES = new Set(['home-dashboard', 'administration-summary', 'economy-dashboard', 'economy-summary', 'economy-monthlyEvolution', 'economy-bySector', 'economy-byCategory', 'economy-sectorRankings', 'economy-paymentMethods', 'economy-recentMovements', 'economy-pending', 'economy-annualSummary', 'economy-comparison', 'economy-insights', 'economy-yearlyBreakdown']);
export const invalidateMovementQueries = (clubId: string | null) => queryClient.invalidateQueries(key => key[1] === (clubId ?? 'no-club') && MOVEMENT_RESOURCES.has(String(key[2])));
/** Invalidates every cached resource belonging to the active tenant. */
export const invalidateTenantQueries = (clubId: string | null) => queryClient.invalidateQueries(key => key[1] === (clubId ?? 'no-club'));
