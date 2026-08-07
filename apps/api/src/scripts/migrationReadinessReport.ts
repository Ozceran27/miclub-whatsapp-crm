import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { getPostgresPool, closePostgresPool } from "../db/postgres.js";
import { migrationManifest } from "./migrationManifest.js";

type LedgerRow = { name: string; checksum: string; applied_at: Date | string };

const environment = process.env.READINESS_ENVIRONMENT?.trim();
if (!environment || !/^[a-zA-Z0-9_.-]{1,64}$/.test(environment)) {
  throw new Error("READINESS_ENVIRONMENT is required (safe label only: letters, numbers, ._-)");
}
const output = process.argv[2];
const docsDirectory = resolve("docs");
if (output) {
  const relativeOutput = relative(docsDirectory, resolve(output));
  if (relativeOutput.startsWith("..") || resolve(relativeOutput) === relativeOutput) {
    throw new Error("The optional report path must be below docs/");
  }
}

function safeCell(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === "|" || character === "`" ? "?" : character;
    })
    .join("")
    .slice(0, 256);
}

function safeDate(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "INVALID_DATE" : date.toISOString();
}

const pool = await getPostgresPool();
try {
  const result = await pool.query<LedgerRow>(
    "select name, checksum, applied_at from public.miclub_schema_migrations order by applied_at, name",
  );
  const observed = new Map(result.rows.map((row) => [row.name, row]));
  const expectedNames = new Set(migrationManifest.map((entry) => basename(entry.path)));
  const anomalies: string[] = [];
  const lines = migrationManifest.map((entry) => {
    const name = basename(entry.path);
    const row = observed.get(name);
    let status = "OK";
    if (!row) { status = "MISSING"; anomalies.push(`${name}: falta en ledger`); }
    else if (row.checksum !== entry.sha256) { status = "CHECKSUM_MISMATCH"; anomalies.push(`${name}: checksum distinto`); }
    const applied = row ? safeDate(row.applied_at) : "—";
    return `| \`${name}\` | \`${entry.sha256}\` | ${row ? `\`${safeCell(row.checksum)}\`` : "—"} | ${applied} | ${status} |`;
  });
  for (const row of result.rows) {
    if (!expectedNames.has(row.name)) anomalies.push(`${safeCell(row.name)}: entrada no incluida en el manifest`);
  }

  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = [
    "# Readiness de migraciones (sanitizado)", "",
    `- Commit: \`${commit}\``,
    `- Entorno: \`${environment}\``,
    `- Generado (UTC): \`${new Date().toISOString()}\``,
    `- Ledger observado: \`${result.rows.length}\` entradas`,
    "- Datos personales: **no consultados ni incluidos**", "",
    "## Ledger vs. manifest", "",
    "| Migración | Checksum esperado | Checksum observado | Aplicada (UTC) | Estado |",
    "|---|---|---|---|---|", ...lines, "",
    "## Anomalías", "", ...(anomalies.length ? anomalies.map((item) => `- ${item}`) : ["- Ninguna."]), "",
    "## Scripts manuales previamente ejecutados", "",
    "- No inferidos automáticamente. Completar sólo con ticket/evidencia aprobada; la existencia de un objeto no demuestra qué script lo creó.", "",
    "## Gate DBA", "",
    "- Si faltan entradas pero existen objetos administrativos, **no insertar filas en el ledger**.",
    "- Comparar definiciones reales con el SQL versionado y aprobar una migración de reconciliación revisada por DBA.", "",
  ].join("\n");
  if (output) writeFileSync(output, report, { encoding: "utf8", mode: 0o600 });
  else process.stdout.write(report);
  if (anomalies.length) process.exitCode = 1;
} finally {
  await closePostgresPool();
}
