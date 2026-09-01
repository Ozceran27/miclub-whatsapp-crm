import type { OfficialExchangeRateProvider } from "./exchangeRateService.js";
import type { CurrencyCode } from "./moneyConversion.js";
import { dateWindow, fetchWithRetries, positiveInteger, responseSummary } from "./officialExchangeRateProviderSupport.js";

type BcraObservation = { idVariable?: number; fecha: string; valor: number | string };

const extractObservations = (payload: unknown): BcraObservation[] => {
  const observations: BcraObservation[] = [];
  const visit = (value: unknown, inheritedId?: number): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item, inheritedId); return; }
    if (value == null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const id = typeof record.idVariable === "number" ? record.idVariable : inheritedId;
    if (typeof record.fecha === "string" && (typeof record.valor === "number" || typeof record.valor === "string")) {
      observations.push({ idVariable: id, fecha: record.fecha.slice(0, 10), valor: record.valor });
      return;
    }
    for (const nested of Object.values(record)) visit(nested, id);
  };
  visit(payload);
  return observations;
};

/** BCRA Comunicación A 3500 variable 5: ARS por USD, sin inversión. */
export class BcraA3500ExchangeRateProvider implements OfficialExchangeRateProvider {
  readonly source = "BCRA-A3500";
  private readonly url = process.env.EXCHANGE_RATE_BCRA_URL?.trim() || "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";
  private readonly variableId = positiveInteger(process.env.EXCHANGE_RATE_BCRA_VARIABLE_ID, 5);
  private readonly timeout = positiveInteger(process.env.EXCHANGE_RATE_BCRA_TIMEOUT_MS, 5000);
  private readonly retries = positiveInteger(process.env.EXCHANGE_RATE_BCRA_RETRIES, 3);
  private readonly lookbackDays = positiveInteger(process.env.EXCHANGE_RATE_BCRA_LOOKBACK_DAYS, 7);

  async fetchRate(base: CurrencyCode, quote: CurrencyCode, date: string) {
    if (base !== "USD" || quote !== "ARS") throw new Error(`BCRA A3500 sólo publica USD/ARS; par recibido: ${base}/${quote}`);
    const window = dateWindow(date, this.lookbackDays);
    const endpoint = new URL(`${this.url.replace(/\/$/, "")}/${this.variableId}`);
    endpoint.searchParams.set("Desde", window.since);
    endpoint.searchParams.set("Hasta", window.until);
    endpoint.searchParams.set("Limit", String(this.lookbackDays + 1));
    endpoint.searchParams.set("Offset", "0");
    const response = await fetchWithRetries(endpoint, "BCRA", this.timeout, this.retries);
    const body = await response.json() as unknown;
    const observations = extractObservations(body);
    const observation = observations.filter(({ fecha, valor }) => fecha <= date && Number(valor) > 0)
      .sort((left, right) => right.fecha.localeCompare(left.fecha))[0];
    if (!observation) throw new Error(`BCRA no devolvió una observación admisible para ${window.since}..${date} (${responseSummary(body)}, observaciones=${observations.length})`);
    return { rate: String(observation.valor), rateDate: observation.fecha, reference: `variable:${observation.idVariable ?? this.variableId};date:${observation.fecha}` };
  }
}
