import { getPostgresEnv, validatePostgresEnv } from "../config/env.js";

type PgPool = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

type PgModule = {
  Pool: new (config: Record<string, unknown>) => PgPool;
};

let pool: PgPool | undefined;

const buildPoolConfig = (): Record<string, unknown> => {
  const env = getPostgresEnv();
  const warnings = validatePostgresEnv(env);
  for (const warning of warnings) console.warn(warning);

  if (env.databaseUrl) {
    return {
      connectionString: env.databaseUrl,
      ssl: env.ssl ? { rejectUnauthorized: false } : undefined
    };
  }

  return {
    host: env.host,
    port: env.port,
    database: env.database,
    user: env.user,
    password: env.password,
    ssl: env.ssl ? { rejectUnauthorized: false } : undefined
  };
};

export const getPostgresPool = async (): Promise<PgPool> => {
  if (pool) return pool;

  const { Pool } = (await import("pg")) as PgModule;
  pool = new Pool(buildPoolConfig());
  return pool;
};

export const closePostgresPool = async (): Promise<void> => {
  if (!pool) return;

  await pool.end();
  pool = undefined;
};
