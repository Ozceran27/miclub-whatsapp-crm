export type SourceSheet = "FITNESS" | "SALON" | "AULA" | "LOCAL_1" | "CANTINA" | "ADMINISTRACION";

export type OperationalStatusKey = "al_dia" | "nuevo_inscripto" | "adeudando" | "abandonado" | "cancelado" | "otro";

export type DebtorStatus = "Adeudando" | "Al día" | "Nuevo Inscripto" | "Abandonado" | "Cancelado" | "Pendiente" | "Desconocido";

export interface StatusBreakdown {
  total: number;
  active: number;
  alDia: number;
  nuevoInscripto: number;
  adeudando: number;
  abandonado: number;
  cancelado: number;
  otros: number;
}

export interface Member {
  id: string;
  nombre: string;
  apellido: string;
  dni?: string;
  telefono: string;
  actividad?: string;
  modalidad?: string;
  cuota?: number;
  estado: DebtorStatus;
  instructor?: string;
  lastPaymentAt?: string;
  lastPaymentAmount?: number;
  lastPaymentSourceSheet?: string;
  lastPaymentConcept?: string;
  vence?: string;
  expirationDate?: string;
  dueDate?: string;
  sourceSheet: SourceSheet;
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedMessage {
  historyId?: number;
  memberId: string;
  nombre?: string;
  phone: string;
  actividad?: string;
  message: string;
  templateName?: string | null;
  waLink: string;
  status?: "prepared" | "opened" | "sent_manual" | "skipped";
  createdAt: string;
  openedAt?: string | null;
  sentAt?: string | null;
  note?: string | null;
}

export interface PrepareMessagesRequest {
  memberIds: string[];
  message: string;
  templateName?: string | null;
}

export interface PrepareMessagesValidation {
  selectedCount: number;
  selectedPreview: Array<{ memberId: string; nombre: string; actividad?: string; cuota?: number; phone: string }>;
  missingPhoneMembers: Array<{ memberId: string; nombre: string }>;
  unresolvedVariables: string[];
  duplicates: Array<{ memberId: string; nombre: string; status: string; createdAt: string }>;
  sampleMessage: string;
}


export interface PaginatedHistoryResponse {
  items: PreparedMessage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ContactedRecentMemberInfo {
  lastSentAt: string;
  count: number;
}

export interface ContactedRecentResponse {
  windowDays: number;
  since: string;
  memberIds: string[];
  byMemberId: Record<string, ContactedRecentMemberInfo>;
}



export interface SectorActivityStat {
  name: string;
  members: number;
}

export type MetricAvailabilityStatus = "available" | "unavailable";

export interface MetricCompleteness {
  status: MetricAvailabilityStatus;
  reason?: string;
  source?: "postgres" | "google_sheets" | "fallback";
}

export type SourceCompleteness = Record<string, MetricCompleteness>;

export interface SummaryMetadata {
  sourceCompleteness?: SourceCompleteness;
  warnings?: string[];
  coverage?: "complete" | "partial" | "unavailable";
}

export interface HighlightedIncome {
  amount: number;
  concept: string;
  date: string;
}

export interface SectorOperationalSummary {
  metadata?: SummaryMetadata;
  fitness: {
    totalMembers: number;
    activeMembers: number;
    totalProfitability: number | null;
    currentMonthProfitability: number | null;
    totalDebtors: number;
    totalDebtAmount: number;
    settlementBalance: number | null;
  };
  salon: {
    totalMembers: number;
    activeMembers: number;
    totalProfitability: number | null;
    currentMonthProfitability: number | null;
    mostPopularActivity: SectorActivityStat | null;
    leastPopularActivity: SectorActivityStat | null;
    settlementBalance?: number | null;
  };
  aula: {
    totalMembers: number;
    activeMembers: number;
    totalProfitability: number | null;
    currentMonthProfitability: number | null;
    averageCommission: number | null;
    mostPopularActivity: SectorActivityStat | null;
    settlementBalance?: number | null;
  };
  local1: {
    totalRelevantIncomeMovements: number;
    last30DaysRelevantIncomeMovements: number;
    totalProfitability: number | null;
    currentMonthProfitability: number | null;
    settlementBalance: number | null;
    highlightedIncome: HighlightedIncome | null;
  };
  cantina: {
    kioskIncome: number;
    drinksIncome: number;
    cmv: number;
    totalProfitability: number | null;
  };
  crm: {
    totalMembers: number;
    activeMembers: number;
    totalDebtors: number;
    totalDebtAmount: number;
  };
}

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
  liquidity: number;
  cash: number;
  bank: number;
  dollars: number;
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

export type EconomyMovementType = "INGRESOS" | "EGRESOS" | string;

export type EconomyFinancialStatus = "pendiente" | "pagado" | "cancelado" | string;

export type EconomyOperationalStatus = "COMPLETADO" | "PENDIENTE" | "CANCELADO" | string;

export interface EconomySummary {
  income: number;
  expenses: number;
  balance: number;
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
  movements: number;
  balanceVariation: number | null;
}

export interface EconomySectorBreakdownItem {
  id: string | null;
  name: string;
  income: number;
  expenses: number;
  balance: number;
  movements: number;
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
  sourcePayload?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EconomyPendingSummary {
  pendingBalance: number;
  pendingIncome: number;
  pendingExpenses: number;
  pendingMovements: number;
  items: EconomyRecentMovement[];
  total: number;
}

export interface EconomyAnnualSummary {
  year: number;
  income: number;
  expenses: number;
  balance: number;
  movements: number;
}

export type EconomyInsightType = "positive" | "warning" | "info" | string;

export interface EconomyInsight {
  key: string;
  type: EconomyInsightType;
  message: string;
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
  paymentMethods: EconomyDashboardCollection<EconomyPaymentMethodItem>;
  recentMovements: EconomyDashboardCollection<EconomyRecentMovement>;
  pending: EconomyPendingSummary;
  annualSummary: EconomyAnnualSummary;
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
