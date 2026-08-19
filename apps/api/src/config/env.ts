export type PostgresEnv = {
  databaseUrl?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  role?: string;
};

/** Dedicated credentials for migrations and explicitly controlled jobs. */
export const getPostgresAdminEnv = (): PostgresEnv => ({
  databaseUrl: readOptional("ADMIN_DATABASE_URL"),
  host: readOptional("PGADMINHOST"),
  port: parsePort("PGADMINPORT"),
  database: readOptional("PGADMINDATABASE"),
  user: readOptional("PGADMINUSER"),
  password: readOptional("PGADMINPASSWORD"),
  ssl: parseBoolean("PGADMINSSL", parseBoolean("PGSSL", false)),
  role: readOptional("PGADMINROLE"),
});

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

/** Validates the deliberately separate credential used by migrations/jobs. */
export const validatePostgresAdminEnv = (env: PostgresEnv = getPostgresAdminEnv()): string[] => {
  if (env.databaseUrl) return [];

  const missing = [
    ["PGADMINHOST", env.host],
    ["PGADMINDATABASE", env.database],
    ["PGADMINUSER", env.user],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missing.length > 0
    ? [`Faltan variables PostgreSQL administrativas: ${missing.join(", ")}. Definí ADMIN_DATABASE_URL o el bloque PGADMIN* en el archivo .env de la raíz del repositorio.`]
    : [];
};

export const validateRuntimeConfig = ({ isProduction }: { isProduction: boolean }): void => {
  if (!isProduction) return;
  const errors: string[] = [];
  if (process.env.AUTH_ENABLED !== "true") errors.push("AUTH_ENABLED debe ser true");
  if ((process.env.SESSION_SECRET?.trim().length ?? 0) < 32) errors.push("SESSION_SECRET debe tener al menos 32 caracteres");
  if (process.env.BOOTSTRAP_DIRECTOR_ENABLED === "true") errors.push("BOOTSTRAP_DIRECTOR_ENABLED debe estar deshabilitado");
  if (normalize(process.env.DATA_SOURCE) !== "postgres") errors.push("DATA_SOURCE debe ser postgres");
  if (normalize(process.env.CRM_SOURCE) !== "postgres") errors.push("CRM_SOURCE debe ser postgres");
  errors.push(...validatePostgresEnv());
  const publicUrl = readOptional("PUBLIC_APP_URL");
  if (!publicUrl || !publicUrl.startsWith("https://")) errors.push("PUBLIC_APP_URL debe ser una URL HTTPS");
  if (publicUrl) {
    try {
      const origin = new URL(publicUrl).origin;
      const allowed = new Set([publicUrl, ...(process.env.CORS_ORIGINS ?? "").split(",")].map((value) => value.trim()).filter(Boolean).map((value) => {
        try { return new URL(value).origin; } catch { return ""; }
      }));
      if (!allowed.has(origin)) errors.push("CORS_ORIGINS/PUBLIC_APP_URL debe permitir el origen oficial");
    } catch { errors.push("PUBLIC_APP_URL no es válida"); }
  }
  if (errors.length) throw new Error(`Configuración de producción insegura:\n- ${errors.join("\n- ")}`);
};
