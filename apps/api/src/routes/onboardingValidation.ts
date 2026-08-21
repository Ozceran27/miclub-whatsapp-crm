import { SUPPORTED_OPERATIONAL_CURRENCIES, type OpeningBalancesRequest } from "@miclub/shared";

export const isOpeningBalancesRequest = (body: unknown): body is OpeningBalancesRequest => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const input = body as Partial<OpeningBalancesRequest>;
  return !Object.keys(body).some(key => !["currency", "cash", "bank", "usdCash", "idempotencyKey"].includes(key))
    && SUPPORTED_OPERATIONAL_CURRENCIES.some(currency => currency === input.currency)
    && [input.cash,input.bank,input.usdCash].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
    && typeof input.idempotencyKey === "string" && Boolean(input.idempotencyKey.trim());
};
