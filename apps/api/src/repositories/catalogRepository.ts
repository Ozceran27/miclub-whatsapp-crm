import { getPostgresPool } from "../db/postgres.js";

export type CatalogName =
  | "activities"
  | "currencies"
  | "discount-rates"
  | "instructors"
  | "movement-categories"
  | "payment-methods"
  | "roles"
  | "salon-hour-prices"
  | "sectors"
  | "system-months";

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
  instructors: {
    sql: `
      select id, person_id, code, display_name, phone, email, is_active, notes, created_at, updated_at
      from miclub.instructors
      order by display_name asc, code asc
    `
  },
  "movement-categories": {
    sql: `
      select id, code, name, direction, is_active, created_at
      from miclub.movement_categories
      order by direction asc, name asc
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
  },
  "system-months": {
    sql: `
      select id, year, month, label, starts_on, ends_on, is_closed, created_at, updated_at
      from miclub.system_months
      order by year desc, month desc
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

export const getSectors = (): Promise<CatalogRow[]> => getCatalogRows("sectors");
export const getActivities = (): Promise<CatalogRow[]> => getCatalogRows("activities");
export const getInstructors = (): Promise<CatalogRow[]> => getCatalogRows("instructors");
export const getMovementCategories = (): Promise<CatalogRow[]> => getCatalogRows("movement-categories");
export const getPaymentMethods = (): Promise<CatalogRow[]> => getCatalogRows("payment-methods");
export const getCurrencies = (): Promise<CatalogRow[]> => getCatalogRows("currencies");
export const getSystemMonths = (): Promise<CatalogRow[]> => getCatalogRows("system-months");
export const getDiscountRates = (): Promise<CatalogRow[]> => getCatalogRows("discount-rates");
export const getSalonHourPrices = (): Promise<CatalogRow[]> => getCatalogRows("salon-hour-prices");
