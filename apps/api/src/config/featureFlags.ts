const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

export const isPostgresEnabled = (): boolean => normalize(process.env.POSTGRES_ENABLED) === "true";
export const getConfiguredDataSource = (): string => normalize(process.env.DATA_SOURCE) ?? "legacy";
