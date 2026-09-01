export const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const responseSummary = (payload: unknown): string => {
  if (payload == null || typeof payload !== "object") return `tipo=${typeof payload}`;
  const keys = Object.keys(payload as Record<string, unknown>).slice(0, 10).join(",") || "sin-claves";
  return `claves=${keys}`;
};

export const dateWindow = (date: string, lookbackDays: number) => {
  const until = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(until.valueOf()) || until.toISOString().slice(0, 10) !== date) throw new Error(`Fecha inválida: ${date}`);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  return { since: since.toISOString().slice(0, 10), until: date };
};

export const fetchWithRetries = async (endpoint: URL, provider: string, timeout: number, retries: number): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeout) });
      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(`${provider} respondió HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} no respondió`);
};
