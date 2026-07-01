export type {
  EconomyAnnualSummary,
  EconomyCategoryBreakdownItem,
  EconomyDashboardCollection,
  EconomyDashboardResponse,
  EconomyInsight,
  EconomyMonthlyEvolutionItem,
  EconomyPaymentMethodItem,
  EconomyPendingSummary,
  EconomyRecentMovement,
  EconomySectorBreakdownItem,
  EconomySummary
} from '@miclub/shared';

export type DashboardStatus = 'loading' | 'error' | 'empty' | 'ready';

export type EconomyDashboardError = {
  message: string;
};
