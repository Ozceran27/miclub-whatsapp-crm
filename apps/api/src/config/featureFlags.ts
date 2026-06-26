const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

export const POSTGRES_ENABLED = normalize(process.env.POSTGRES_ENABLED) === "true";
export const DATA_SOURCE = normalize(process.env.DATA_SOURCE) ?? "legacy";
