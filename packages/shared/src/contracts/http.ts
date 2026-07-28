import type { LegacyUnknownCode } from "./legacy.js";

export const API_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED", "SESSION_EXPIRED", "FORBIDDEN", "VALIDATION_ERROR",
  "SERVICE_UNAVAILABLE", "INTERNAL_ERROR", "HTTP_ERROR", "NETWORK_ERROR",
  "REQUEST_TIMEOUT", "REQUEST_CANCELLED", "INVALID_REQUEST", "INVALID_CREDENTIALS",
  "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "NO_ACTIVE_MEMBERSHIP", "AUTH_CONFIGURATION_ERROR",
] as const;

export type KnownApiErrorCode = typeof API_ERROR_CODES[number];
export type LegacyApiErrorCode = LegacyUnknownCode<"api-error">;
export type ApiErrorCode = KnownApiErrorCode | LegacyApiErrorCode;

export interface ApiErrorResponse {
  ok: false;
  error: true;
  message: string;
  status: number;
  code: ApiErrorCode;
  requestId?: string;
  retryable: boolean;
  details?: unknown;
  batchId?: string;
}

export interface PagePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends PagePagination { items: T[]; }

export interface OffsetPagination {
  limit: number;
  offset: number;
  total: number;
}

export interface OffsetPaginatedResponse<T> extends OffsetPagination { items: T[]; }
