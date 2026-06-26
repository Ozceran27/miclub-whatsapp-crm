export type JsonRecord = Record<string, unknown>;

export const toCamelCase = (key: string): string =>
  key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

export const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, nestedValue]) => [toCamelCase(key), normalizeValue(nestedValue)]));
  }
  return value;
};

export const normalizeRow = (row: JsonRecord): JsonRecord =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamelCase(key), normalizeValue(value)]));
