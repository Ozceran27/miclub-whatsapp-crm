import type { ApiErrorResponse, PagePagination, PaginatedResponse as HttpPaginatedResponse } from "./http.js";
import type { LegacyUnknownCode } from "./legacy.js";

export type AdministrationApiErrorResponse = ApiErrorResponse;
export type AdministrationPagination = PagePagination;
export type PaginatedResponse<T> = HttpPaginatedResponse<T>;

export type AdministrationRecordStatus = "active" | "inactive" | "archived" | LegacyUnknownCode<"administration-record-status">;
export type AdministrationMovementType = "INGRESOS" | "EGRESOS" | LegacyUnknownCode<"administration-movement-type">;
export type AdministrationFinancialStatus = "sin_movimientos" | "pendiente" | "pagado" | "parcial" | "a_liquidar" | "liquidado" | "deuda" | "vencido" | "cancelado" | "otro" | LegacyUnknownCode<"administration-financial-status">;
export type AdministrationOperationalStatus = "COMPLETADO" | "PENDIENTE" | "CANCELADO" | "REVISAR" | LegacyUnknownCode<"administration-operational-status">;
export type AdministrationEnrollmentStatus = "al_dia" | "nuevo_inscripto" | "adeudando" | "abandonado" | "cancelado" | "otro" | LegacyUnknownCode<"administration-enrollment-status">;
export type AdministrationTaskStatus = "pending" | "in_progress" | "blocked" | "done" | "cancelled" | LegacyUnknownCode<"administration-task-status">;
export type AdministrationRequestStatus = "new" | "in_review" | "approved" | "rejected" | "resolved" | "cancelled" | LegacyUnknownCode<"administration-request-status">;
export type AdministrationRequestPriority = "low" | "medium" | "high" | "urgent" | LegacyUnknownCode<"administration-request-priority">;

export interface AdministrationMetricComparison {
  current: number;
  previous: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  direction: "up" | "down" | "stable" | "none" | LegacyUnknownCode<"administration-metric-direction">;
  comparable: boolean;
  reason?: string;
}

export interface AdministrationMetric {
  value: number;
  comparison: AdministrationMetricComparison | null;
}

export interface AdministrationSummaryResponse {
  balance: {
    cutoffDate: string | null;
    liquidity: AdministrationMetric;
    cash: AdministrationMetric;
    bank: AdministrationMetric;
    dollars: AdministrationMetric;
  };
  pending: {
    income: AdministrationMetric;
    expenses: AdministrationMetric;
    balance: AdministrationMetric;
    movements: AdministrationMetric;
  };
  totals: {
    sectors: AdministrationMetric;
    activities: AdministrationMetric;
    workers: AdministrationMetric;
    tasks: AdministrationMetric;
    requests: AdministrationMetric;
    movements: AdministrationMetric;
    enrollments: AdministrationMetric;
  };
  recentMovements: AdministrationMovementDto[];
  generatedAt: string;
  metadata?: {
    warnings?: string[];
    source?: "postgres" | "google_sheets" | LegacyUnknownCode<"administration-summary-source">;
  };
}

export interface AdministrationSectorDto {
  id: string;
  clubId?: string | null;
  managerPersonId?: string | null;
  code: string;
  name: string;
  color?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
  maxCapacity?: number | null;
  municipalStatus?: string | null;
  financialStatus?: AdministrationFinancialStatus | null;
  operationalStatus?: AdministrationOperationalStatus | null;
  usesEnrollments: boolean;
  usesActivities: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministrationActivityDto {
  id: string;
  clubId?: string | null;
  sectorId: string;
  sectorCode?: string | null;
  sectorName?: string | null;
  managerPersonId?: string | null;
  instructorId?: string | null;
  code?: string | null;
  name: string;
  modality?: string | null;
  color?: string | null;
  monthlyFee: number;
  clubCommissionPercent: number;
  instructorCommissionPercent: number;
  maxCapacity?: number | null;
  status: AdministrationRecordStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministrationWorkerDto {
  id: string;
  clubId?: string | null;
  personId?: string | null;
  code?: string | null;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  dni?: string | null;
  phone?: string | null;
  email?: string | null;
  sectorIds?: string[];
  activityIds?: string[];
  role?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministrationTaskDto {
  id: string;
  clubId?: string | null;
  title: string;
  description?: string | null;
  status: AdministrationTaskStatus;
  priority?: AdministrationRequestPriority | null;
  sectorId?: string | null;
  sectorName?: string | null;
  assigneeWorkerId?: string | null;
  requesterPersonId?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministrationRequestDto {
  id: string;
  clubId?: string | null;
  subject: string;
  description?: string | null;
  status: AdministrationRequestStatus;
  priority: AdministrationRequestPriority;
  requesterPersonId?: string | null;
  requesterName?: string | null;
  assignedWorkerId?: string | null;
  sectorId?: string | null;
  activityId?: string | null;
  taskId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministrationMovementDto {
  id: string;
  externalId?: string | null;
  date: string | null;
  type: AdministrationMovementType | null;
  categoryId?: string | null;
  category: string | null;
  sectorId?: string | null;
  sectorCode?: string | null;
  sector: string | null;
  concept: string | null;
  personId?: string | null;
  counterpartyText?: string | null;
  amount: number;
  taxes?: number | null;
  paymentMethodId?: string | null;
  paymentMethod: string | null;
  financialStatus?: AdministrationFinancialStatus | null;
  status: AdministrationOperationalStatus | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdministrationEnrollmentDto {
  id: string;
  externalId?: string | null;
  clubId?: string | null;
  personId: string;
  firstName?: string | null;
  lastName?: string | null;
  dni?: string | null;
  activityId: string;
  activityName?: string | null;
  sectorId?: string | null;
  sectorName?: string | null;
  feeAmount: number;
  status: AdministrationEnrollmentStatus;
  dueDate?: string | null;
  source?: string | null;
  notes?: unknown;
  createdAt: string;
  updatedAt: string;
}

export type AdministrationSectorsResponse = PaginatedResponse<AdministrationSectorDto>;
export type AdministrationActivitiesResponse = PaginatedResponse<AdministrationActivityDto>;
export type AdministrationWorkersResponse = PaginatedResponse<AdministrationWorkerDto>;
export type AdministrationTasksResponse = PaginatedResponse<AdministrationTaskDto>;
export type AdministrationRequestsResponse = PaginatedResponse<AdministrationRequestDto>;
export type AdministrationMovementsResponse = PaginatedResponse<AdministrationMovementDto>;
export type AdministrationEnrollmentsResponse = PaginatedResponse<AdministrationEnrollmentDto>;
