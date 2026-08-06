import type { SourceSheet } from "./migration.js";
import type { PaginatedResponse } from "./http.js";

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


export type PaginatedHistoryResponse = PaginatedResponse<PreparedMessage>;

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
  source?: "postgres";
}

export type SourceCompleteness = Record<string, MetricCompleteness>;

export interface SummaryMetadata {
  sourceCompleteness?: SourceCompleteness;
  warnings?: string[];
  coverage?: "complete" | "partial" | "unavailable";
  cuotasACobrarSource?: "v_dashboard_basic" | "derived_receivables";
  cuotasACobrarDebug?: {
    cuotasACobrar: number;
    source: "v_dashboard_basic" | "derived_receivables";
    dashboardValue: number | null;
    fallbackValue: number | null;
    difference: number | null;
    differsBeyondThreshold: boolean;
    threshold: number;
  };
}

export interface HighlightedIncome {
  amount: number;
  concept: string;
  date: string;
}

/** Tenant-owned sector identity and optional presentation attributes. */
export interface SectorCatalogItem {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface SectorOperationalItem extends SectorCatalogItem {
  totalMembers: number;
  activeMembers: number;
  totalDebtors: number;
  totalDebtAmount: number;
  totalProfitability: number;
  currentMonthProfitability: number;
  settlementBalance: number | null;
  mostPopularActivity: SectorActivityStat | null;
  leastPopularActivity: SectorActivityStat | null;
}

export interface SectorOperationalSummary {
  metadata?: SummaryMetadata;
  /** Authoritative tenant catalog. Sector id, never its display name, is identity. */
  sectors: SectorOperationalItem[];
  /**
   * @deprecated Import compatibility only. Remove after every tenant has been
   * re-imported from PostgreSQL and no consumer reads legacy sheet metrics
   * (target: 2026-12-31). New UI code must consume `sectors`.
   */
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
