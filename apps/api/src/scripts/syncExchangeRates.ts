import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePostgresAdminPool, getPostgresAdminPool } from "../db/postgres.js";
import { createExchangeRateService } from "../services/exchangeRateService.js";
import { BcraA3500ExchangeRateProvider } from "../services/officialExchangeRateProvider.js";
import type { CurrencyCode } from "../services/moneyConversion.js";

// npm workspaces starts this script with apps/api as cwd. Resolve the repository
// root explicitly so it reads the same .env as the API and migration scripts.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
dotenv.config({ path: path.join(repositoryRoot, ".env"), quiet: true });

const provider = new BcraA3500ExchangeRateProvider();
const pivot = (process.env.EXCHANGE_RATE_PIVOT_CURRENCY || "USD") as CurrencyCode;
const adminPool = await getPostgresAdminPool();
const service = createExchangeRateService(provider, { maxAgeDays: Number(process.env.EXCHANGE_RATE_MAX_AGE_DAYS || 4), pivot, executor: adminPool });
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const pairs = (process.env.EXCHANGE_RATE_SYNC_PAIRS || "USD/ARS").split(",").map((pair) => pair.trim()).filter(Boolean);

try {
  for (const pair of pairs) {
    const [base, quote, extra] = pair.split("/");
    if (!base || !quote || extra) throw new Error(`Par inválido en EXCHANGE_RATE_SYNC_PAIRS: ${pair}`);
    await service.sync(base as CurrencyCode, quote as CurrencyCode, date);
  }
} finally {
  await closePostgresAdminPool();
}
