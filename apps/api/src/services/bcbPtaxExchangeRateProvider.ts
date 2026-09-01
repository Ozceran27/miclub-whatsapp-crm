import type { OfficialExchangeRateProvider } from "./exchangeRateService.js";
import type { CurrencyCode } from "./moneyConversion.js";
import { dateWindow, fetchWithRetries, positiveInteger, responseSummary } from "./officialExchangeRateProviderSupport.js";

type BcbObservation = { data?: string; valor?: string | number };

/** Banco Central do Brasil SGS series 1: BRL por USD (PTAX venta), sin inversión. */
export class BcbPtaxExchangeRateProvider implements OfficialExchangeRateProvider {
  readonly source = "BCB-SGS-1";
  private readonly url = process.env.EXCHANGE_RATE_BCB_URL?.trim() || "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados";
  private readonly timeout = positiveInteger(process.env.EXCHANGE_RATE_BCB_TIMEOUT_MS, 5000);
  private readonly retries = positiveInteger(process.env.EXCHANGE_RATE_BCB_RETRIES, 3);
  private readonly lookbackDays = positiveInteger(process.env.EXCHANGE_RATE_BCB_LOOKBACK_DAYS, 7);

  async fetchRate(base: CurrencyCode, quote: CurrencyCode, date: string) {
    if (base !== "USD" || quote !== "BRL") throw new Error(`BCB SGS 1 sólo publica USD/BRL; par recibido: ${base}/${quote}`);
    const window = dateWindow(date, this.lookbackDays);
    const endpoint = new URL(this.url);
    endpoint.searchParams.set("formato", "json");
    endpoint.searchParams.set("dataInicial", window.since.split("-").reverse().join("/"));
    endpoint.searchParams.set("dataFinal", date.split("-").reverse().join("/"));
    const response = await fetchWithRetries(endpoint, "BCB", this.timeout, this.retries);
    const body = await response.json() as unknown;
    if (!Array.isArray(body)) throw new Error(`BCB devolvió un payload inválido (${responseSummary(body)})`);
    const observations = (body as BcbObservation[]).map(({ data, valor }) => ({
      date: typeof data === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(data) ? data.split("/").reverse().join("-") : "",
      value: typeof valor === "string" || typeof valor === "number" ? Number(String(valor).replace(",", ".")) : NaN,
    })).filter(({ date: observed, value }) => observed <= date && value > 0).sort((a, b) => b.date.localeCompare(a.date));
    const observation = observations[0];
    if (!observation) throw new Error(`BCB no devolvió una observación admisible para ${window.since}..${date}`);
    return { rate: String(observation.value), rateDate: observation.date, reference: `series:1;date:${observation.date}` };
  }
}
