/** PostgreSQL is the only ordinary dashboard data source. */
export type DataSource = "postgres";

export const getDataSource = (): DataSource => "postgres";

export const shouldUsePostgresDataSource = (): true => true;
