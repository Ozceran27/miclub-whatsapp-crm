import { getPostgresPool } from "./postgres.js";

export type PostgresHealth = {
  server_time: Date;
  database_name: string;
};

export const getPostgresHealth = async (): Promise<PostgresHealth> => {
  const pool = await getPostgresPool();
  const result = await pool.query<PostgresHealth>("select now() as server_time, current_database() as database_name");
  const [health] = result.rows;

  if (!health) {
    throw new Error("PostgreSQL no devolvió información de health.");
  }

  return health;
};
