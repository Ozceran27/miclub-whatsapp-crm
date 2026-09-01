import type { OfficialExchangeRateProvider } from "./exchangeRateService.js";
import type { CurrencyCode } from "./moneyConversion.js";
import { BcbPtaxExchangeRateProvider } from "./bcbPtaxExchangeRateProvider.js";
import { BcraA3500ExchangeRateProvider } from "./bcraA3500ExchangeRateProvider.js";
import { EcbUsdEurExchangeRateProvider } from "./ecbUsdEurExchangeRateProvider.js";

export { BcbPtaxExchangeRateProvider, BcraA3500ExchangeRateProvider, EcbUsdEurExchangeRateProvider };

export type CurrencyPair = `${CurrencyCode}/${CurrencyCode}`;
type ProviderFactory = () => OfficialExchangeRateProvider;

const providerFactories = new Map<CurrencyPair, ProviderFactory>([
  ["USD/ARS", () => new BcraA3500ExchangeRateProvider()],
  ["USD/BRL", () => new BcbPtaxExchangeRateProvider()],
  ["USD/EUR", () => new EcbUsdEurExchangeRateProvider()],
]);

export const supportedOfficialExchangeRatePairs = () => [...providerFactories.keys()];

export const resolveOfficialExchangeRateProvider = (base: CurrencyCode, quote: CurrencyCode): OfficialExchangeRateProvider => {
  const pair = `${base}/${quote}` as CurrencyPair;
  const factory = providerFactories.get(pair);
  if (!factory) throw new Error(`No hay proveedor oficial configurado para ${pair}`);
  return factory();
};
