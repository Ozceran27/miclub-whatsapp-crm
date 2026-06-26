import { getPostgresPool } from "../db/postgres.js";

export type CatalogName = "activities" | "currencies" | "discount-rates" | "payment-methods" | "roles" | "salon-hour-prices" | "sectors";

export type CatalogRow = Record<string, unknown>;

type CatalogQuery = {
  sql: string;
};

const catalogQueries: Record<CatalogName, CatalogQuery> = {
  activities: {
    sql: `
      select id, sector_id, manager_person_id, instructor_id, code, name, modality, color, monthly_fee,
        club_commission_percent, instructor_commission_percent, max_capacity, status, notes, created_at, updated_at
      from miclub.activities
      order by name asc
    `
  },
  currencies: {
    sql: `
      select code, name, symbol
      from miclub.currencies
      order by code asc
    `
  },
  "discount-rates": {
    sql: `
      select id, percent, label, is_active, created_at
      from miclub.discount_rates
      order by percent asc, label asc nulls last
    `
  },
  "payment-methods": {
    sql: `
      select id, name, is_active, created_at
      from miclub.payment_methods
      order by name asc
    `
  },
  roles: {
    sql: `
      select id, code, name, description, created_at
      from miclub.roles
      order by code asc
    `
  },
  "salon-hour-prices": {
    sql: `
      select id, hours, price, is_active, created_at
      from miclub.salon_hour_prices
      order by hours asc
    `
  },
  sectors: {
    sql: `
      select id, manager_person_id, code, name, color, opening_time, closing_time, max_capacity, municipal_status,
        financial_status, operational_status, uses_enrollments, uses_activities, notes, created_at, updated_at
      from miclub.sectors
      order by name asc
    `
  }
};

export const catalogNames = Object.keys(catalogQueries) as CatalogName[];

export const isCatalogName = (value: string): value is CatalogName =>
  Object.prototype.hasOwnProperty.call(catalogQueries, value);

export const getCatalogRows = async (catalogName: CatalogName): Promise<CatalogRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<CatalogRow>(catalogQueries[catalogName].sql);
  return result.rows;
};
