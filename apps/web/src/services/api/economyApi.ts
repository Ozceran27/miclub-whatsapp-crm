import { apiJson } from '../../api';

export const economyEndpoints = {
  summary: '/api/economy/summary', monthlyEvolution: '/api/economy/monthly-evolution', bySector: '/api/economy/by-sector?limit=6',
  byCategory: '/api/economy/by-category?limit=6', sectorRankings: '/api/economy/sector-rankings?limit=5', paymentMethods: '/api/economy/payment-methods',
  recentMovements: '/api/economy/recent-movements?limit=10', pending: '/api/economy/pending?limit=8', annualSummary: '/api/economy/annual-summary',
  comparison: '/api/economy/comparison', insights: '/api/economy/insights', yearlyBreakdown: '/api/economy/yearly-breakdown'
} as const;

export const getEconomyResource = <T>(key: keyof typeof economyEndpoints, signal?: AbortSignal) =>
  apiJson<T>(economyEndpoints[key], { cache: 'no-store', signal });
