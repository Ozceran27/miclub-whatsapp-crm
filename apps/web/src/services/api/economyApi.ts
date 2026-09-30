import { apiJson } from '../../api';

export const economyEndpoints = {
  summary: '/api/economy/summary', availableYears: '/api/economy/available-years', monthlyEvolution: '/api/economy/monthly-evolution', bySector: '/api/economy/by-sector?limit=6',
  byCategory: '/api/economy/by-category?limit=6', sectorRankings: '/api/economy/sector-rankings?limit=6', paymentMethods: '/api/economy/payment-methods',
  recentMovements: '/api/economy/recent-movements?limit=10', pending: '/api/economy/pending?limit=8', annualSummary: '/api/economy/annual-summary',
  comparison: '/api/economy/comparison', insights: '/api/economy/insights', yearlyBreakdown: '/api/economy/yearly-breakdown'
} as const;

export const getEconomyResource = <T>(key: keyof typeof economyEndpoints, signal?: AbortSignal, year?: number) => {
  const url = new URL(economyEndpoints[key], window.location.origin);
  if (year !== undefined) url.searchParams.set(key === 'yearlyBreakdown' ? 'asOf' : 'year', String(year));
  return apiJson<T>(`${url.pathname}${url.search}` as `/${string}`, { cache: 'no-store', signal });
};
