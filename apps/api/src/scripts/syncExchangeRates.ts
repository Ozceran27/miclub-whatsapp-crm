import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePostgresAdminPool, getPostgresAdminPool } from "../db/postgres.js";
import { createExchangeRateService } from "../services/exchangeRateService.js";
import { resolveOfficialExchangeRateProvider } from "../services/officialExchangeRateProvider.js";
import type { CurrencyCode } from "../services/moneyConversion.js";

// npm workspaces starts this script with apps/api as cwd. Resolve the repository
// root explicitly so it reads the same .env as the API and migration scripts.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
dotenv.config({ path: path.join(repositoryRoot, ".env"), quiet: true });

const pivot = (process.env.EXCHANGE_RATE_PIVOT_CURRENCY || "USD") as CurrencyCode;
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const pairs = (process.env.EXCHANGE_RATE_SYNC_PAIRS || "USD/ARS,USD/BRL,USD/EUR").split(",").map((pair) => pair.trim()).filter(Boolean);

// Resolve every adapter before opening the admin pool: an unsupported or malformed
// pair must never be able to create sync-state rows or partially write rates.
const jobs = pairs.map((pair) => {
  const [base, quote, extra] = pair.split("/");
  if (!base || !quote || extra) throw new Error(`Par inválido en EXCHANGE_RATE_SYNC_PAIRS: ${pair}`);
  const provider = resolveOfficialExchangeRateProvider(base as CurrencyCode, quote as CurrencyCode);
  return { base: base as CurrencyCode, quote: quote as CurrencyCode, provider };
});

const adminPool = await getPostgresAdminPool();
try {
  for (const { base, quote, provider } of jobs) {
    const service = createExchangeRateService(provider, { maxAgeDays: Number(process.env.EXCHANGE_RATE_MAX_AGE_DAYS || 4), pivot, executor: adminPool });
    const stored = await service.sync(base, quote, date);
    console.log(`Cotización sincronizada ${base}/${quote}: ${stored.rate} al ${stored.rateDate} (${stored.source})`);
  }
} finally {
  await closePostgresAdminPool();
}
