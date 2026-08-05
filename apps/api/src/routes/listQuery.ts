import type { Request } from "express";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;
export const MAX_FILTER_LENGTH = 120;

const parseNonNegativeInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const parsePositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const boundedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, MAX_FILTER_LENGTH) : undefined;
};

export type ListRequestQuery = {
  limit: number;
  offset: number;
  filters: Record<string, string | undefined>;
};

export type ListQueryOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export const parseListQuery = (
  req: Request,
  filterNames: readonly string[],
  options: ListQueryOptions = {}
): ListRequestQuery => {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIST_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_LIST_LIMIT;
  const page = parseNonNegativeInteger(req.query.page, 0);
  const limit = Math.min(parsePositiveInteger(req.query.limit, defaultLimit), maxLimit);
  const offset = req.query.offset === undefined && page > 0
    ? (page - 1) * limit
    : parseNonNegativeInteger(req.query.offset, 0);

  return {
    limit,
    offset,
    filters: Object.fromEntries(filterNames.map((name) => [name, boundedString(req.query[name])]))
  };
};
