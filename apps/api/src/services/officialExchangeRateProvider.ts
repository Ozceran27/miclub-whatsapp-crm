import type { CurrencyCode } from "./moneyConversion.js";
import type { OfficialExchangeRateProvider } from "./exchangeRateService.js";

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

type BcraObservation = { idVariable?: number; fecha: string; valor: number | string };

const extractBcraObservations = (payload: unknown): BcraObservation[] => {
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

const responseSummary = (payload: unknown): string => {
  if (payload == null || typeof payload !== "object") return `tipo=${typeof payload}`;
  const keys = Object.keys(payload as Record<string, unknown>).slice(0, 10).join(",") || "sin-claves";
  return `claves=${keys}`;
};

/** Official wholesale USD/ARS rate (Comunicación A 3500, monetary variable 5). */
export class BcraA3500ExchangeRateProvider implements OfficialExchangeRateProvider {
  readonly source = process.env.EXCHANGE_RATE_SOURCE?.trim() || "BCRA-A3500";
  private readonly url = process.env.EXCHANGE_RATE_PROVIDER_URL?.trim()
    || "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";
  private readonly variableId = positiveInteger(process.env.EXCHANGE_RATE_BCRA_VARIABLE_ID, 5);
  private readonly timeout = positiveInteger(process.env.EXCHANGE_RATE_TIMEOUT_MS, 5000);
  private readonly retries = positiveInteger(process.env.EXCHANGE_RATE_RETRIES, 3);
  private readonly lookbackDays = positiveInteger(process.env.EXCHANGE_RATE_LOOKBACK_DAYS, 7);

  async fetchRate(base: CurrencyCode, quote: CurrencyCode, date: string) {
    if (base !== "USD" || quote !== "ARS") {
      throw new Error(`BCRA A3500 sólo publica USD/ARS; par recibido: ${base}/${quote}`);
    }
    const until = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(until.valueOf())) throw new Error(`Fecha inválida: ${date}`);
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - this.lookbackDays);

    let lastError: unknown;
    // BCRA retired v3 with HTTP 410. Keep the replacement here so installations
    // with the former documented URL recover without editing data or code first.
    const baseUrls = [...new Set([
      this.url,
      this.url.replace("/v3.0/", "/v4.0/"),
    ])];
    for (const baseUrl of baseUrls) {
      for (let attempt = 1; attempt <= this.retries; attempt += 1) {
        try {
          const endpoint = new URL(`${baseUrl.replace(/\/$/, "")}/${this.variableId}`);
          endpoint.searchParams.set("Desde", since.toISOString().slice(0, 10));
          endpoint.searchParams.set("Hasta", date);
          endpoint.searchParams.set("Limit", String(this.lookbackDays + 1));
          endpoint.searchParams.set("Offset", "0");
          const response = await fetch(endpoint, { signal: AbortSignal.timeout(this.timeout) });
          if (!response.ok) {
            const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 200);
            const error = new Error(`BCRA respondió HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
            if (response.status === 410 && baseUrl.includes("/v3.0/")) { lastError = error; break; }
            throw error;
          }
          const body = await response.json() as unknown;
          const observations = extractBcraObservations(body);
          const observation = observations
            ?.filter(({ fecha, valor }) => Boolean(fecha) && valor != null && Number(valor) > 0 && fecha! <= date)
            .sort((left, right) => right.fecha!.localeCompare(left.fecha!))[0];
          if (!observation?.fecha || observation.valor == null) {
            throw new Error(`BCRA no devolvió una observación admisible para ${since.toISOString().slice(0, 10)}..${date} (${responseSummary(body)}, observaciones=${observations.length})`);
          }
          return {
            rate: String(observation.valor),
            rateDate: observation.fecha,
            reference: `variable:${observation.idVariable ?? this.variableId};date:${observation.fecha}`,
          };
        } catch (error) {
          lastError = error;
          if (attempt < this.retries) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("BCRA no respondió");
  }
}
