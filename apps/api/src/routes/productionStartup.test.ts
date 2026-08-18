import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

test("startup commands never invoke the director repair script", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const apiPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/api/package.json"), "utf8")) as { scripts?: Record<string, string> };
  const startupCommands = [rootPackage.scripts?.start, rootPackage.scripts?.["start:prod"], apiPackage.scripts?.start, apiPackage.scripts?.dev].filter(Boolean).join("\n");

  assert.doesNotMatch(startupCommands, /bootstrap(?::director|Director)/i);
});

test("production startup does not load SQLite or Google Sheets", async () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  const loader = path.join(import.meta.dirname, "../testFixtures/forbidOperationalDependencies.mjs");
  const child = spawn(process.execPath, [
    "--import", "tsx",
    "--experimental-loader", loader,
    "--input-type=module",
    "--eval", "const { startServer } = await import('./apps/api/src/index.ts'); await startServer();",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "0",
      AUTH_ENABLED: "true",
      SESSION_SECRET: "production-startup-contract-secret-32-characters",
      DATA_SOURCE: "postgres",
      CRM_SOURCE: "postgres",
      POSTGRES_ENABLED: "true",
      DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unused",
      PUBLIC_APP_URL: "https://miclub.example",
      CORS_ORIGINS: "https://miclub.example",
      IMPORT_ENDPOINTS_ENABLED: "false",
      DEBUG_ENDPOINTS_ENABLED: "false",
      BOOTSTRAP_DIRECTOR_ENABLED: "false",
      GOOGLE_SHEETS_ENABLED: "false",
      SQLITE_DB_PATH: "/dev/null/must-not-be-opened.sqlite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error(`startup timed out:\n${output}`)), 10_000);
    child.on("exit", (code) => {
      finish(new Error(`startup exited with ${code}:\n${output}`));
    });
    const poll = setInterval(() => {
      if (!output.includes("API running")) return;
      finish();
    }, 25);
  }).finally(() => child.kill("SIGTERM"));

  assert.match(output, /API running/);
  assert.doesNotMatch(output, /forbidden operational dependency|SQLITE_CANTOPEN/);
});
