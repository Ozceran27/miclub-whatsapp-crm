import type { EconomyOperationalStatus } from "../movementStatus.js";
import type { SummaryMetadata } from "./members.js";
import type { LegacyUnknownCode } from "./legacy.js";

export interface AdminMovement {
  id: string;
  fecha?: string;
  tipo: string;
  categoria: string;
  concepto: string;
  contraparte?: string;
  sector: string;
  monto: number;
  impuestos?: number;
  estado: string;
  medioPago?: string;
}

export interface FinancialSummary {
  valuationStatus: "COMPLETE" | "INCOMPLETE_EXCHANGE_RATE";
  unvaluedAccountCount: number;
  missingPairs: Array<{ baseCurrencyCode: string; quoteCurrencyCode: string }>;
  /** Live metrics are recalculated; closed calculations persist exchange-rate usages. */
  valuationMode: "LIVE_RECALCULATED" | "CLOSED_REPRODUCIBLE";
  liquidity: number;
  cash: number;
  bank: number;
  dollars: number;
  presentationCurrencyCode: string;
  appliedRate: number | null;
  rateDate: string | null;
  rateSource: string | null;
  rateDirection: "DIRECT" | "INVERSE" | "IDENTITY" | null;
  dollarsConverted: number;
}

export interface SectorBalance {
  sector: string;
  amount: number;
}

export interface SectorAmountBreakdown {
  name: string;
  amount: number;
}

export interface CategoryAmountBreakdown {
  name: string;
  amount: number;
}

export type KnownEconomyMovementType = "INGRESOS" | "EGRESOS";
export type LegacyEconomyMovementType = LegacyUnknownCode<"movement-type">;
export type EconomyMovementType = KnownEconomyMovementType | LegacyEconomyMovementType;

export type KnownEconomyFinancialStatus = "pendiente" | "pagado" | "cancelado";
export type LegacyEconomyFinancialStatus = LegacyUnknownCode<"financial-status">;
export type EconomyFinancialStatus = KnownEconomyFinancialStatus | LegacyEconomyFinancialStatus;

export interface EconomySummary {
  month?: { label: string; income: number; expenses: number; balance: number };
  current?: { liquidity: number; projectedBalance: number };
  income: number;
  expenses: number;
  balance: number;
  liquidity?: number;
  projectedBalance?: number;
  pendingBalance: number;
  completedMovements: number;
  totalMovements: number;
}

export interface EconomyMonthlyEvolutionItem {
  year: number;
  month: number;
  period: string;
  income: number;
  expenses: number;
  balance: number;
  utility?: number;
  operatingProfitability?: number;
  growth?: number | null;
  economicGrowth?: number | null;
  clientGrowth?: number | null;
  cumulativeEnrollments?: number;
  movements: number;
  incomeVariation: number | null;
  expensesVariation: number | null;
  balanceVariation: number | null;
}

export interface EconomyComparisonMetric {
  key: "income" | "expenses" | "balance" | "liquidity" | LegacyUnknownCode<"comparison-metric">;
  label: string;
  current: number;
  previous: number;
  variation?: number | null;
  percentageChange?: number | null;
  absoluteChange?: number;
  direction: "up" | "down" | "stable" | "flat" | "none" | LegacyUnknownCode<"comparison-direction">;
  comparable?: boolean;
  impact?: "favorable" | "unfavorable" | "neutral" | LegacyUnknownCode<"comparison-impact">;
  applies: boolean;
  available?: boolean;
  reason?: string;
  currentValue?: number;
  targetDate?: string;
  oldestAvailableDate?: string;
  currentDate?: string;
  previousDate?: string;
  currentPeriod?: string;
  previousPeriod?: string;
  snapshotDate?: string | null;
}

export interface EconomyComparison {
  currentPeriod: string;
  previousPeriod: string;
  items: EconomyComparisonMetric[];
  total: number;
}

export interface EconomySectorBreakdownItem {
  id: string | null;
  name: string;
  income: number;
  expenses: number;
  balance: number;
  movements: number;
}

export interface EconomySectorRankings {
  monthly: EconomyDashboardCollection<EconomySectorBreakdownItem> & { label: string };
  annual: EconomyDashboardCollection<EconomySectorBreakdownItem> & { year: number };
}

export interface EconomyCategoryBreakdownItem {
  id: string | null;
  name: string;
  income: number;
  expenses: number;
  balance: number;
  movements: number;
}

export interface EconomyPaymentMethodItem {
  id: string | null;
  name: string;
  amount: number;
  movements: number;
  percentage?: number;
}

export interface EconomyPaymentMethodPeriod {
  label?: string;
  year?: number;
  items: EconomyPaymentMethodItem[];
  total: number;
}

export interface EconomyPaymentMethodStatusCounts {
  completed: number;
  pending: number;
  canceled: number;
  review?: number;
  other?: number;
}

export interface EconomyPaymentMethodsSummary extends EconomyDashboardCollection<EconomyPaymentMethodItem> {
  monthly?: EconomyPaymentMethodPeriod;
  annual?: EconomyPaymentMethodPeriod;
  statusCounts?: EconomyPaymentMethodStatusCounts;
  nonOperatingExpenses?: {
    categories: string[];
    monthly: { amount: number; movements: number };
    annual: { amount: number; movements: number };
  };
  debtLiabilities?: {
    categories: string[];
    monthly: { amount: number; movements: number };
    annual: { amount: number; movements: number };
  };
  servicesAndTaxes?: {
    services: { categories: string[]; monthly: number; annual: number };
    taxes: { categories: string[]; monthly: number; annual: number };
  };
}

export interface EconomyRecentMovement {
  id: string;
  externalId?: string | null;
  movementDate?: string | null;
  movementType: EconomyMovementType;
  categoryId?: string | null;
  category?: string | null;
  sectorId?: string | null;
  sectorCode?: string | null;
  sectorName?: string | null;
  concept?: string | null;
  personId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  counterpartyText?: string | null;
  amount: number;
  taxes?: number | null;
  paymentMethodId?: string | null;
  paymentMethod?: string | null;
  financialStatus?: EconomyFinancialStatus | null;
  operationalStatus?: EconomyOperationalStatus | null;
  source?: string | null;
}

export interface EconomyPendingSummary {
  pendingBalance: number;
  pendingIncome: number;
  pendingExpenses: number;
  pendingMovements: number;
  items: EconomyRecentMovement[];
  total: number;
}


export interface EconomyYearlySeries {
  key: string;
  label: string;
  values: number[];
}

export interface EconomyOperatingIncomeCategorySeries extends EconomyYearlySeries {
  annualTotal: number;
}

export interface EconomyYearlyBreakdownMonth {
  key: string;
  label: string;
  fullLabel?: string;
  year: number;
  month: number;
}

export interface EconomyYearlyBreakdownPeriod {
  from: string;
  toExclusive: string;
  fromMonth: string;
  toMonth: string;
  timezone: string;
  monthCount: number;
}

export interface EconomyYearlyBreakdown {
  period: EconomyYearlyBreakdownPeriod;
  months: EconomyYearlyBreakdownMonth[];
  operatingIncomeByCategory: EconomyOperatingIncomeCategorySeries[];
  expensesByType: EconomyYearlySeries[];
  metadata: {
    unclassifiedExpenseCount: number;
    unclassifiedExpenseCategories?: { category: string; count: number }[];
    generatedAt: string;
    timezone: string;
    signConvention?: string;
    consideredMovements?: number;
  };
}

export interface EconomyAnnualSummary {
  year: number;
  income: number;
  expenses: number;
  balance: number;
  movements: number;
}

export type EconomyInsightType = "positive" | "warning" | "info" | LegacyUnknownCode<"economy-insight">;

export interface EconomyInsight {
  key: string;
  type: EconomyInsightType;
  title?: string;
  message: string;
  metric?: string;
  period?: string;
  value: number | null;
}

export interface EconomyDashboardCollection<TItem> {
  items: TItem[];
  total: number;
}

export interface EconomyDashboardResponse {
  summary: EconomySummary;
  monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem>;
  bySector: EconomyDashboardCollection<EconomySectorBreakdownItem>;
  byCategory: EconomyDashboardCollection<EconomyCategoryBreakdownItem>;
  sectorRankings?: EconomySectorRankings;
  paymentMethods: EconomyPaymentMethodsSummary;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
  yearlyBreakdown?: EconomyYearlyBreakdown;
  comparison: EconomyComparison;
  insights: EconomyDashboardCollection<EconomyInsight>;
}

export interface ClubOperationsSummary extends FinancialSummary {
  metadata?: SummaryMetadata;
  pendingIncome: number;
  pendingExpenses: number;
  pendingNetBalance: number;
  cuotasAdeudadas: number;
  cuotasACobrar: number;
  futureReceivableFeesUntilMonthEnd: number;
  settlementBalance: number;
  /** @deprecated Usar settlementBalance; se conserva temporalmente como alias compatible. */
  saldosAPagar: number;
  projectedBalance: number;
  sectorBalances: SectorBalance[];
  incomeBySector: SectorAmountBreakdown[];
  expenseBySector: SectorAmountBreakdown[];
  incomeByCategory: CategoryAmountBreakdown[];
  expenseByCategory: CategoryAmountBreakdown[];
  totalIncomeSectors: number;
  remainingIncomeSectors: number;
  totalExpenseSectors: number;
  remainingExpenseSectors: number;
  totalIncomeCategories: number;
  remainingIncomeCategories: number;
  totalExpenseCategories: number;
  remainingExpenseCategories: number;
}
