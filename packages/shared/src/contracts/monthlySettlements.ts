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

export interface PersistedSettlement extends MonthlySettlementLine {
  initialObligationId?: string;
  id: string;
  revision: number;
  reviewState: SettlementReviewState;
  closedAt: string | null;
  personName: string;
  activityName: string;
  baseBalance?: number;
  adjustments?: number;
}
export type CompensationObligationState = 'DRAFT' | 'APPROVED' | 'REQUIRES_REVIEW' | 'CANCELLED';
export interface EmployeeCompensationObligation {
  id: string;
  employeeId: string;
  personId: string;
  personName: string;
  currencyCode: string;
  periodFrom: string;
  periodTo: string;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  reviewState: CompensationObligationState;
  revision: number;
  sectorId: string | null;
}
export interface FinanceDiagnostic { activityId: string; message: string }
export interface FinancialCircuit {
  month: string;
  today: string;
  settlements: PersistedSettlement[];
  balanceTotals: { currencyCode: string; activityToPay: number; activityToCollect: number; fixedCompensationToPay: number; totalToPay: number; approvedToPay: number; pendingReviewToPay: number }[];
  compensationObligations?: EmployeeCompensationObligation[];
  payoutGroups?: { id: string; personId: string; personName: string; currencyCode: string; direction: 'PAY' | 'COLLECT'; amount: number; status: 'COMPLETED' | 'VOIDED'; createdAt: string; reason: string; voidedAt: string | null }[];
  diagnostics: FinanceDiagnostic[];
  projection: FinancialProjection;
  accounts: { id: string; name: string; currencyCode: string }[];
  people: { id: string; name: string }[];
  terms: { id: string; activityId: string; activityName: string; personId: string | null; revision: number; mode: string; effectiveFrom: string; effectiveTo: string | null; fixedClubFee: number | null; partialMonthPolicy: PartialMonthPolicy | null }[];
}
