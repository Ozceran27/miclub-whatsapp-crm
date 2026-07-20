export type {
  EconomyAnnualSummary,
  EconomyComparison,
  EconomyComparisonMetric,
  EconomyCategoryBreakdownItem,
  EconomyDashboardCollection,
  EconomyDashboardResponse,
  EconomyInsight,
  EconomyMonthlyEvolutionItem,
  EconomyPaymentMethodItem,
  EconomyPaymentMethodsSummary,
  EconomyPendingSummary,
  EconomyRecentMovement,
  EconomySectorBreakdownItem,
  EconomySectorRankings,
  EconomySummary
} from '@miclub/shared';

export type DashboardStatus = 'loading' | 'error' | 'empty' | 'ready';

export type EconomyDashboardError = {
  message: string;
};
