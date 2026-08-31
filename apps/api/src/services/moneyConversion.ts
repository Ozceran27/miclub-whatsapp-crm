export type CurrencyCode = "ARS" | "USD" | "BRL" | "EUR";

export type AppliedExchangeRate = {
  id?: string;
  baseCurrencyCode: CurrencyCode;
  quoteCurrencyCode: CurrencyCode;
  rate: string;
  rateDate: string;
  rateType: string;
  source: string;
};

const DECIMALS = 12n;
const SCALE = 10n ** DECIMALS;

const scaled = (value: string | number): bigint => {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Valor decimal inválido: ${text}`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const result = BigInt(whole) * SCALE + BigInt((fraction + "0".repeat(Number(DECIMALS))).slice(0, Number(DECIMALS)));
  return negative ? -result : result;
};

const divideRounded = (numerator: bigint, denominator: bigint): bigint => {
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * ((absolute + denominator / 2n) / denominator);
};

/** Converts with decimal fixed-point math and half-away-from-zero rounding to cents. */
export const convertMoney = ({ amount, fromCurrency, toCurrency, valuationDate, quote }: {
  amount: string | number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  valuationDate: string;
  quote: AppliedExchangeRate;
}): string => {
  if (quote.rateDate > valuationDate) throw new Error("La cotización es posterior a la fecha de valoración");
  const direct = quote.baseCurrencyCode === fromCurrency && quote.quoteCurrencyCode === toCurrency;
  const inverse = quote.baseCurrencyCode === toCurrency && quote.quoteCurrencyCode === fromCurrency;
  if (!direct && !inverse) throw new Error("La cotización no corresponde al par solicitado");
  const raw = direct
    ? divideRounded(scaled(amount) * scaled(quote.rate), SCALE)
    : divideRounded(scaled(amount) * SCALE, scaled(quote.rate));
  const cents = divideRounded(raw * 100n, SCALE);
  return `${cents < 0n ? "-" : ""}${(cents < 0n ? -cents : cents) / 100n}.${String((cents < 0n ? -cents : cents) % 100n).padStart(2, "0")}`;
};
