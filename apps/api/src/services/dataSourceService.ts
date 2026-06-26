export type DataSource = "legacy" | "postgres";

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

export const getDataSource = (): DataSource => normalize(process.env.DATA_SOURCE) === "postgres" ? "postgres" : "legacy";

export const shouldUsePostgresDataSource = (): boolean => getDataSource() === "postgres";
