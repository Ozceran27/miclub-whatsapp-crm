type PostgresEnv = {
  databaseUrl?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
};

const readOptional = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

const parseBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = readOptional(key);
  if (!value) return defaultValue;

  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;

  console.warn(`${key} tiene un valor inválido (${value}). Usando ${String(defaultValue)}.`);
  return defaultValue;
};

const parsePort = (key: string): number | undefined => {
  const value = readOptional(key);
  if (!value) return undefined;

  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;

  console.warn(`${key} debe ser un puerto válido entre 1 y 65535. Se ignora el valor recibido.`);
  return undefined;
};

export const getPostgresEnv = (): PostgresEnv => ({
  databaseUrl: readOptional("DATABASE_URL"),
  host: readOptional("PGHOST"),
  port: parsePort("PGPORT"),
  database: readOptional("PGDATABASE"),
  user: readOptional("PGUSER"),
  password: readOptional("PGPASSWORD"),
  ssl: parseBoolean("PGSSL", false)
});

export const validatePostgresEnv = (env: PostgresEnv = getPostgresEnv()): string[] => {
  if (env.databaseUrl) return [];

  const missing = [
    ["PGHOST", env.host],
    ["PGDATABASE", env.database],
    ["PGUSER", env.user]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missing.length > 0 ? [`Faltan variables PostgreSQL: ${missing.join(", ")}.`] : [];
};

export const warnIfProductionCrmSourceIsNotPostgres = (isProduction: boolean): void => {
  if (!isProduction) return;

  const crmSource = normalize(process.env.CRM_SOURCE) ?? "sqlite";
  if (crmSource === "postgres") return;

  console.warn(`CRM_SOURCE debería ser postgres en producción. Valor actual: ${crmSource}. Se mantiene el comportamiento legacy/local sin bloquear el arranque.`);
};
