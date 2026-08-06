import { catalogNames, getCatalogRows, type CatalogName, type CatalogRow } from "../repositories/catalogRepository.js";
import type { RequestAuthContext } from "../auth/types.js";

export type NormalizedCatalogItem = Record<string, unknown>;

export type CatalogResponse = {
  catalog: CatalogName;
  items: NormalizedCatalogItem[];
  total: number;
};

const toCamelCase = (key: string): string =>
  key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  return value;
};

export const normalizeCatalogRow = (row: CatalogRow): NormalizedCatalogItem =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamelCase(key), normalizeValue(value)]));

export const listCatalogs = (): CatalogName[] => catalogNames;

export const getCatalog = async (auth: RequestAuthContext, catalog: CatalogName): Promise<CatalogResponse> => {
  const rows = await getCatalogRows(catalog, auth.clubId, auth.permissions.includes("sectors:any") ? undefined : auth.sectorIds);
  const items = rows.map(normalizeCatalogRow);
  return { catalog, items, total: items.length };
};

export const getCatalogItems = async (auth: RequestAuthContext, catalog: CatalogName): Promise<NormalizedCatalogItem[]> => {
  const response = await getCatalog(auth, catalog);
  return response.items;
};
