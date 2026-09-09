/** Monetary values are expressed in the currency's major unit, to two decimals. */
export type SettlementReviewState = 'DRAFT' | 'APPROVED' | 'REQUIRES_REVIEW';
export type SettlementPaymentState = 'PENDING' | 'PARTIAL' | 'SETTLED' | 'DEBT';
export type PartialMonthPolicy = 'CALENDAR_DAYS' | 'FULL_MONTH';

export interface MonthlySettlementLine {
  activityId: string;
  personId: string;
  termId: string;
  currencyCode: string;
  month: string;
  income: number;
  refunds: number;
  responsibleIncome: number;
  responsibleRefunds: number;
  fixedClubFee: number;
  payments: number;
  debtCollections: number;
  balance: number;
  paymentState: SettlementPaymentState;
}

export interface ResponsibleCompensation {
  personId: string;
  currencyCode: string;
  debtLineId: string;
  creditLineId: string;
  amount: number;
}

export interface FinancialProjectionComponent {
  /** Same underlying obligation must use the same key across data sources. */
  obligationId: string;
  amount: number;
  responsibleAmount: number;
  /** Links a separately persisted forecast settlement to this collection. */
  responsibleObligationId?: string;
}

export interface FinancialProjection {
  calculatedAt: string;
  currencyCode: string;
  liquidity: number | null;
  pendingCollections: number;
  pendingPayments: number;
  pendingSettlements: number;
  expectedSettlements: number;
  additionalClubReceivables: number;
  projectedBalance: number | null;
  futureEstimate: number | null;
  complete: boolean;
  assumptions: string[];
}
