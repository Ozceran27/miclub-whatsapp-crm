import { getPostgresEnv, validatePostgresEnv } from "../config/env.js";

type PgPool = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

type PgClient = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  release: () => void;
};

type PgPoolConstructor = new (config: Record<string, unknown>) => PgPool;

type PgModule = {
  Pool?: PgPoolConstructor;
  default?: {
    Pool?: PgPoolConstructor;
  };
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

  const pgModule = (await import("pg")) as PgModule;
  const Pool = pgModule.Pool ?? pgModule.default?.Pool;

  if (typeof Pool !== "function") {
    throw new Error("No se pudo cargar pg.Pool");
  }

  pool = new Pool(buildPoolConfig());
  return pool;
};

export const closePostgresPool = async (): Promise<void> => {
  if (!pool) return;

  await pool.end();
  pool = undefined;
};
