import type { OfficialExchangeRateProvider } from "./exchangeRateService.js";
import type { CurrencyCode } from "./moneyConversion.js";
import { dateWindow, fetchWithRetries, positiveInteger } from "./officialExchangeRateProviderSupport.js";

/** ECB EXR D.USD.EUR.SP00.A: USD por EUR; se invierte para almacenar EUR por USD. */
export class EcbUsdEurExchangeRateProvider implements OfficialExchangeRateProvider {
  readonly source = "ECB-EXR-USD-EUR";
  private readonly url = process.env.EXCHANGE_RATE_ECB_URL?.trim() || "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A";
  private readonly timeout = positiveInteger(process.env.EXCHANGE_RATE_ECB_TIMEOUT_MS, 5000);
  private readonly retries = positiveInteger(process.env.EXCHANGE_RATE_ECB_RETRIES, 3);
  private readonly lookbackDays = positiveInteger(process.env.EXCHANGE_RATE_ECB_LOOKBACK_DAYS, 7);

  async fetchRate(base: CurrencyCode, quote: CurrencyCode, date: string) {
    if (base !== "USD" || quote !== "EUR") throw new Error(`BCE EXR sólo admite USD/EUR normalizado; par recibido: ${base}/${quote}`);
    const window = dateWindow(date, this.lookbackDays);
    const endpoint = new URL(this.url);
    endpoint.searchParams.set("startPeriod", window.since);
    endpoint.searchParams.set("endPeriod", date);
    endpoint.searchParams.set("format", "csvdata");
    const response = await fetchWithRetries(endpoint, "BCE", this.timeout, this.retries);
    const csv = await response.text();
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines[0]?.split(",").map((value) => value.replace(/^"|"$/g, "")) ?? [];
    const dateIndex = headers.indexOf("TIME_PERIOD");
    const valueIndex = headers.indexOf("OBS_VALUE");
    if (dateIndex < 0 || valueIndex < 0) throw new Error("BCE devolvió un CSV inválido (faltan TIME_PERIOD/OBS_VALUE)");
    const observations = lines.slice(1).map((line) => {
      const columns = line.split(",").map((value) => value.replace(/^"|"$/g, ""));
      return { date: columns[dateIndex] ?? "", value: Number(columns[valueIndex]) };
    }).filter(({ date: observed, value }) => observed <= date && value > 0).sort((a, b) => b.date.localeCompare(a.date));
    const observation = observations[0];
    if (!observation) throw new Error(`BCE no devolvió una observación admisible para ${window.since}..${date}`);
    return { rate: String(1 / observation.value), rateDate: observation.date, reference: `key:D.USD.EUR.SP00.A;date:${observation.date};published:${observation.value};transform:inverse` };
  }
}
