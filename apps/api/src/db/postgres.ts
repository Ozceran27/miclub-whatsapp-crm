import { getPostgresAdminEnv, getPostgresEnv, validatePostgresEnv, type PostgresEnv } from "../config/env.js";

export type QueryExecutor = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

export type PgPool = QueryExecutor & {
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

export type PgClient = QueryExecutor & {
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
let adminPool: PgPool | undefined;

const buildPoolConfig = (env: PostgresEnv): Record<string, unknown> => {
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

  pool = new Pool(buildPoolConfig(getPostgresEnv()));
  return pool;
};

/** Administrative pool for migrations/jobs; never use it from request handlers. */
export const getPostgresAdminPool = async (): Promise<PgPool> => {
  if (adminPool) return adminPool;
  const env = getPostgresAdminEnv();
  const warnings = validatePostgresEnv(env);
  if (warnings.length > 0) throw new Error(`Credenciales PostgreSQL administrativas incompletas: ${warnings.join(" ")}`);
  const pgModule = (await import("pg")) as PgModule;
  const Pool = pgModule.Pool ?? pgModule.default?.Pool;
  if (typeof Pool !== "function") throw new Error("No se pudo cargar pg.Pool");
  adminPool = new Pool(buildPoolConfig(env));
  return adminPool;
};

export const closePostgresPool = async (): Promise<void> => {
  if (!pool) return;

  await pool.end();
  pool = undefined;
};

export const closePostgresAdminPool = async (): Promise<void> => {
  if (!adminPool) return;
  await adminPool.end();
  adminPool = undefined;
};

/** Test seam for repository-level tenant isolation tests. */
export const setPostgresPoolForTests = (testPool: PgPool | undefined): void => {
  if (process.env.NODE_ENV !== "test") throw new Error("setPostgresPoolForTests solo está disponible en tests");
  pool = testPool;
};
