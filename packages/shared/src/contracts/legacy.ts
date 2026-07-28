/** A code preserved from a legacy source but not recognised by the current contract. */
export type LegacyUnknownCode<TDomain extends string> = string & {
  readonly __legacyUnknownCode: TDomain;
};

export const asLegacyUnknownCode = <TDomain extends string>(value: string): LegacyUnknownCode<TDomain> =>
  value as LegacyUnknownCode<TDomain>;
