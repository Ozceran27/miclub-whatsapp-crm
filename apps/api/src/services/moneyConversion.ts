export type CurrencyCode = "ARS" | "USD" | "BRL" | "EUR";

export type ExchangeRateComponent = Readonly<{
  id: string;
  /** Currency order and value exactly as persisted by the provider. */
  baseCurrencyCode: CurrencyCode;
  quoteCurrencyCode: CurrencyCode;
  rate: string;
  rateDate: string;
  rateType: string;
  source: string;
  direction: "direct" | "inverse";
}>;

export type AppliedExchangeRate = Readonly<{
  id?: string;
  /** The normalized order: rate is always quote units per one base unit. */
  baseCurrencyCode: CurrencyCode;
  quoteCurrencyCode: CurrencyCode;
  rate: string;
  rateDate: string;
  rateType: string;
  source: string;
  kind?: "direct" | "inverse" | "cross";
  /** Immutable original database quotations used to produce rate. */
  components?: readonly ExchangeRateComponent[];
}>;

const DECIMAL_PLACES = 12;
const SCALE = 10n ** BigInt(DECIMAL_PLACES);

const scaled = (value: string | number): bigint => {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Valor decimal inválido: ${text}`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const padded = fraction.padEnd(DECIMAL_PLACES + 1, "0");
  let result = BigInt(whole) * SCALE + BigInt(padded.slice(0, DECIMAL_PLACES));
  if (padded[DECIMAL_PLACES] >= "5") result += 1n;
  return negative ? -result : result;
};

const divideRounded = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) throw new Error("División decimal por cero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const result = (absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator;
  return negative ? -result : result;
};

const formatted = (value: bigint, places = DECIMAL_PLACES): string => {
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % SCALE).padStart(DECIMAL_PLACES, "0").slice(0, places).replace(/0+$/, "");
  return `${value < 0n ? "-" : ""}${absolute / SCALE}${fraction ? `.${fraction}` : ""}`;
};

/** Fixed-point multiplication, rounded half away from zero to 12 decimal places. */
export const multiplyDecimal = (left: string, right: string): string =>
  formatted(divideRounded(scaled(left) * scaled(right), SCALE));

/** Fixed-point division, rounded half away from zero to 12 decimal places. */
export const divideDecimal = (numerator: string, denominator: string): string =>
  formatted(divideRounded(scaled(numerator) * SCALE, scaled(denominator)));

/** Converts with decimal fixed-point math and half-away-from-zero rounding to cents. */
export const convertMoney = ({ amount, fromCurrency, toCurrency, valuationDate, quote }: {
  amount: string | number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  valuationDate: string;
  quote: AppliedExchangeRate;
}): string => {
  if (quote.rateDate > valuationDate) throw new Error("La cotización es posterior a la fecha de valoración");
  if (quote.baseCurrencyCode !== fromCurrency || quote.quoteCurrencyCode !== toCurrency) {
    throw new Error("La cotización no está normalizada para el par solicitado");
  }
  const raw = divideRounded(scaled(amount) * scaled(quote.rate), SCALE);
  const cents = divideRounded(raw * 100n, SCALE);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};
