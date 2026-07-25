import assert from "node:assert/strict";
import test from "node:test";
import { validateRuntimeConfig } from "./env.js";

test("producción rechaza AUTH_ENABLED=false", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      AUTH_ENABLED: "false",
      SESSION_SECRET: "x".repeat(32),
      DATABASE_URL: "postgres://example.invalid/db",
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
      PUBLIC_APP_URL: "https://gestion.meclub.com.ar",
      BOOTSTRAP_DIRECTOR_ENABLED: "false",
    });
    assert.doesNotThrow(() => validateRuntimeConfig({ isProduction: true }));
  } finally {
    process.env = original;
  }
});
