import { SUPPORTED_OPERATIONAL_CURRENCIES } from "@miclub/shared";
import { getPostgresPool } from "../db/postgres.js";
import type { QueryExecutor } from "../db/postgres.js";
import type { AppliedExchangeRate, CurrencyCode } from "./moneyConversion.js";

export interface OfficialExchangeRateProvider {
  readonly source: string;
  fetchRate(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<{ rate: string; rateDate: string; reference?: string }>;
}

export class ExchangeRateError extends Error {}
const supported = new Set<string>(SUPPORTED_OPERATIONAL_CURRENCIES);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export const validateProviderRate = (value: { rate?: string; rateDate?: string }, base: string, quote: string) => {
  if (!supported.has(base) || !supported.has(quote) || base === quote) throw new ExchangeRateError("Código de moneda no soportado");
  if (!value.rate || !value.rateDate || !validDate(value.rateDate) || !/^\d+(\.\d+)?$/.test(value.rate) || Number(value.rate) <= 0) {
    throw new ExchangeRateError("Respuesta de cotización incompleta o inválida");
  }
};

export const createExchangeRateService = (provider: OfficialExchangeRateProvider, options: { maxAgeDays: number; pivot: CurrencyCode; rateType?: string; executor?: QueryExecutor }) => ({
  async sync(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<AppliedExchangeRate> {
    try {
      const fetched = await provider.fetchRate(base, quote, date);
      validateProviderRate(fetched, base, quote);
      const pool = options.executor ?? await getPostgresPool();
      const result = await pool.query<Record<string, string>>(`
        insert into miclub.exchange_rates(base_currency_code, quote_currency_code, rate, rate_date, rate_type, source, source_reference)
        values($1,$2,$3,$4,$5,$6,$7)
        on conflict(base_currency_code, quote_currency_code, rate_date, rate_type, source)
        do nothing returning id`, [base, quote, fetched.rate, fetched.rateDate, options.rateType ?? "official", provider.source, fetched.reference ?? null]);
      await pool.query(`insert into miclub.exchange_rate_sync_state(source,last_attempt_at,last_success_at,last_error)
        values($1,now(),now(),null) on conflict(source) do update set last_attempt_at=now(),last_success_at=now(),last_error=null,updated_at=now()`, [provider.source]);
      return { id: result.rows[0]?.id, baseCurrencyCode: base, quoteCurrencyCode: quote, rate: fetched.rate, rateDate: fetched.rateDate, rateType: options.rateType ?? "official", source: provider.source };
    } catch (error) {
      const pool = options.executor ?? await getPostgresPool();
      await pool.query(`insert into miclub.exchange_rate_sync_state(source,last_attempt_at,last_error) values($1,now(),$2)
        on conflict(source) do update set last_attempt_at=now(),last_error=$2,updated_at=now()`, [provider.source, error instanceof Error ? error.message : String(error)]);
      throw new ExchangeRateError(`Falló la sincronización con ${provider.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  async latest(base: CurrencyCode, quote: CurrencyCode, valuationDate: string): Promise<AppliedExchangeRate> {
    if (!validDate(valuationDate)) throw new ExchangeRateError("Fecha de valoración inválida");
    const pool = options.executor ?? await getPostgresPool();
    const result = await pool.query<Record<string, string>>(`
      with candidates as (
        select id,base_currency_code,quote_currency_code,rate,rate_date,rate_type,source,1 priority from miclub.exchange_rates
        where base_currency_code=$1 and quote_currency_code=$2 and rate_date <= $3 and rate_type=$4
        union all
        select id,base_currency_code,quote_currency_code,rate,rate_date,rate_type,source,2 from miclub.exchange_rates
        where base_currency_code=$2 and quote_currency_code=$1 and rate_date <= $3 and rate_type=$4
      ) select * from candidates order by rate_date desc,priority limit 1`, [base, quote, valuationDate, options.rateType ?? "official"]);
    const row = result.rows[0];
    if (row) {
      const age = (Date.parse(`${valuationDate}T00:00:00Z`) - Date.parse(`${row.rate_date}T00:00:00Z`)) / 86400000;
      if (age > options.maxAgeDays) throw new ExchangeRateError(`Cotización vencida (${age} días; máximo ${options.maxAgeDays})`);
      return { id: row.id, baseCurrencyCode: row.base_currency_code as CurrencyCode, quoteCurrencyCode: row.quote_currency_code as CurrencyCode, rate: row.rate, rateDate: row.rate_date, rateType: row.rate_type, source: row.source };
    }
    if (base !== options.pivot && quote !== options.pivot) {
      const [left, right] = await Promise.all([this.latest(base, options.pivot, valuationDate), this.latest(options.pivot, quote, valuationDate)]);
      return { baseCurrencyCode: base, quoteCurrencyCode: quote, rate: String(Number(left.rate) * Number(right.rate)), rateDate: left.rateDate < right.rateDate ? left.rateDate : right.rateDate, rateType: options.rateType ?? "official", source: `${left.source}+${right.source}` };
    }
    throw new ExchangeRateError(`No existe cotización admisible para ${base}/${quote} al ${valuationDate}`);
  },
});
