const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

export type RuntimeDataSource = "postgres";

export const isPostgresEnabled = (): boolean => normalize(process.env.POSTGRES_ENABLED) !== "false";
export const getConfiguredDataSource = (): RuntimeDataSource => "postgres";
