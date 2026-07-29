import type { Request } from "express";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;
export const MAX_FILTER_LENGTH = 120;

const parseNonNegativeInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
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

export const parseListQuery = (req: Request, filterNames: readonly string[]): ListRequestQuery => ({
  limit: Math.min(parseNonNegativeInteger(req.query.limit, DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT),
  offset: parseNonNegativeInteger(req.query.offset, 0),
  filters: Object.fromEntries(filterNames.map((name) => [name, boundedString(req.query[name])]))
});
