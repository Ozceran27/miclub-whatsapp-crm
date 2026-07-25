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
  tenantScoped?: boolean;
};

const catalogQueries: Record<CatalogName, CatalogQuery> = {
  activities: {
    tenantScoped: true,
    sql: `
      select id, sector_id, manager_person_id, instructor_id, code, name, modality, color, monthly_fee,
        club_commission_percent, instructor_commission_percent, max_capacity, status, notes, created_at, updated_at
      from miclub.activities where club_id = $1
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
    tenantScoped: true,
    sql: `
      select id, percent, label, is_active, created_at
      from miclub.discount_rates where club_id = $1
      order by percent asc, label asc nulls last
    `
  },
  instructors: {
    tenantScoped: true,
    sql: `
      select id, person_id, code, display_name, phone, email, is_active, notes, created_at, updated_at
      from miclub.instructors where club_id = $1
      order by display_name asc, code asc
    `
  },
  "movement-categories": {
    tenantScoped: true,
    sql: `
      select id, code, name, direction, is_active, created_at
      from miclub.movement_categories where club_id = $1
      order by direction asc, name asc
    `
  },
  "payment-methods": {
    tenantScoped: true,
    sql: `
      select id, name, is_active, created_at
      from miclub.payment_methods where club_id = $1
      order by name asc
    `
  },
  roles: {
    tenantScoped: true,
    sql: `
      select id, code, name, description, created_at
      from miclub.roles where club_id = $1
      order by code asc
    `
  },
  "salon-hour-prices": {
    tenantScoped: true,
    sql: `
      select id, hours, price, is_active, created_at
      from miclub.salon_hour_prices where club_id = $1
      order by hours asc
    `
  },
  sectors: {
    tenantScoped: true,
    sql: `
      select id, manager_person_id, code, name, color, opening_time, closing_time, max_capacity, municipal_status,
        financial_status, operational_status, uses_enrollments, uses_activities, notes, created_at, updated_at
      from miclub.sectors where club_id = $1
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

export const getCatalogRows = async (catalogName: CatalogName, clubId: string): Promise<CatalogRow[]> => {
  const pool = await getPostgresPool();
  const query = catalogQueries[catalogName];
  const result = await pool.query<CatalogRow>(query.sql, query.tenantScoped ? [clubId] : []);
  return result.rows;
};

export const getSectors = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("sectors", clubId);
export const getActivities = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("activities", clubId);
export const getInstructors = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("instructors", clubId);
export const getMovementCategories = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("movement-categories", clubId);
export const getPaymentMethods = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("payment-methods", clubId);
export const getCurrencies = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("currencies", clubId);
export const getSystemMonths = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("system-months", clubId);
export const getDiscountRates = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("discount-rates", clubId);
export const getSalonHourPrices = (clubId: string): Promise<CatalogRow[]> => getCatalogRows("salon-hour-prices", clubId);
