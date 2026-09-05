import assert from "node:assert/strict";
import test from "node:test";
import { getPostgresAdminEnv, validatePostgresAdminEnv, validateRuntimeConfig } from "./env.js";

test("admin admite una URL separada y un rol propietario explícito", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      ADMIN_DATABASE_URL: "postgres://migrator:secret@localhost/miclub_gestion",
      PGADMINROLE: "miclub_app",
      PGADMINSSL: "false",
    });
    assert.deepEqual(getPostgresAdminEnv(), {
      databaseUrl: "postgres://migrator:secret@localhost/miclub_gestion",
      host: undefined,
      port: undefined,
      database: undefined,
      user: undefined,
      password: undefined,
      ssl: false,
      role: "miclub_app",
    });
  } finally {
    process.env = original;
  }
});

test("admin informa los nombres PGADMIN y la ubicación del .env", () => {
  assert.deepEqual(validatePostgresAdminEnv({}), [
    "Faltan variables PostgreSQL administrativas: PGADMINHOST, PGADMINDATABASE, PGADMINUSER. Definí ADMIN_DATABASE_URL o el bloque PGADMIN* en el archivo .env de la raíz del repositorio.",
  ]);
  assert.deepEqual(validatePostgresAdminEnv({ databaseUrl: "postgres://admin@example.invalid/miclub" }), []);
});

test("producción rechaza AUTH_ENABLED=false", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      AUTH_ENABLED: "false",
      SESSION_SECRET: "x".repeat(32),
      DATABASE_URL: "postgres://example.invalid/db",
      DATA_SOURCE: "postgres",
      CRM_SOURCE: "postgres",
      PUBLIC_APP_URL: "https://gestion.meclub.com.ar",
      BOOTSTRAP_DIRECTOR_ENABLED: "false",
    });
    assert.throws(() => validateRuntimeConfig({ isProduction: true }), /AUTH_ENABLED debe ser true/);
  } finally {
    process.env = original;
  }
});

test("producción acepta la configuración segura mínima", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      AUTH_ENABLED: "true",
      SESSION_SECRET: "x".repeat(32),
      DATABASE_URL: "postgres://example.invalid/db",
      DATA_SOURCE: "postgres",
      CRM_SOURCE: "postgres",
      PUBLIC_APP_URL: "https://gestion.meclub.com.ar",
      BOOTSTRAP_DIRECTOR_ENABLED: "false",
    });
    assert.doesNotThrow(() => validateRuntimeConfig({ isProduction: true }));
  } finally {
    process.env = original;
  }
});

test("producción admite cualquier etiqueta de billing durante la etapa pre-billing", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      AUTH_ENABLED: "true",
      SESSION_SECRET: "x".repeat(32),
      DATABASE_URL: "postgres://example.invalid/db",
      DATA_SOURCE: "postgres",
      CRM_SOURCE: "postgres",
      PUBLIC_APP_URL: "https://gestion.meclub.com.ar",
      BOOTSTRAP_DIRECTOR_ENABLED: "false",
      BILLING_MODE: "sandbox",
      DEPLOYMENT_ENV: "local",
      BILLING_SANDBOX_STAGING_AUTHORIZATION: "",
    });
    assert.doesNotThrow(() => validateRuntimeConfig({ isProduction: true }));
  } finally {
    process.env = original;
  }
});

test("producción exige PostgreSQL para paneles y CRM", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      AUTH_ENABLED: "true",
      SESSION_SECRET: "x".repeat(32),
      DATABASE_URL: "postgres://example.invalid/db",
      DATA_SOURCE: "legacy",
      CRM_SOURCE: "sqlite",
      PUBLIC_APP_URL: "https://gestion.meclub.com.ar",
      BOOTSTRAP_DIRECTOR_ENABLED: "false",
    });
    assert.throws(
      () => validateRuntimeConfig({ isProduction: true }),
      /DATA_SOURCE debe ser postgres[\s\S]*CRM_SOURCE debe ser postgres/,
    );
  } finally {
    process.env = original;
  }
});
