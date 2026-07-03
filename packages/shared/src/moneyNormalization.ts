const countOccurrences = (value: string, character: string): number =>
  value.split(character).length - 1;

const parseSingleSeparatorNumber = (value: string, separator: "," | "."): string => {
  const separatorIndex = value.indexOf(separator);
  const integerPart = value.slice(0, separatorIndex);
  const fractionalPart = value.slice(separatorIndex + 1);
  if (fractionalPart.length === 3 && /^\d{1,3}$/.test(integerPart)) return `${integerPart}${fractionalPart}`;
  if (fractionalPart.length >= 1 && fractionalPart.length <= 2) return `${integerPart}.${fractionalPart}`;
  return `${integerPart}${fractionalPart}`;
};

export const normalizeMoneyAmount = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const isNegative = /[-−–—]/.test(raw) || /^\s*\(.*\)\s*$/.test(raw);
  let cleaned = raw
    .replace(/[−–—]/g, "-")
    .replace(/[^\d,.-]/g, "")
    .replace(/-/g, "");
  if (!/\d/.test(cleaned)) return 0;

  const commaCount = countOccurrences(cleaned, ",");
  const dotCount = countOccurrences(cleaned, ".");
  if (commaCount > 0 && dotCount > 0) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    cleaned = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(/,/g, ".")
      : cleaned.replace(/,/g, "");
  } else if (dotCount > 1) cleaned = cleaned.replace(/\./g, "");
  else if (commaCount > 1) cleaned = cleaned.replace(/,/g, "");
  else if (dotCount === 1) cleaned = parseSingleSeparatorNumber(cleaned, ".");
  else if (commaCount === 1) cleaned = parseSingleSeparatorNumber(cleaned, ",");

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return isNegative && parsed !== 0 ? -parsed : parsed;
};

export const normalizeMembershipFeeUnit = (value: unknown): number => {
  let fee = normalizeMoneyAmount(value);
  let abs = Math.abs(fee);

  // Las cuotas mensuales del club son importes unitarios. Cuando llegan con
  // escala corrida ($30.000 como 300.000, o $25.000 como 25.000.000),
  // reducimos la escala hasta volver al rango operativo esperado.
  while (abs > 100_000 && Number.isInteger(fee / 10)) {
    fee /= 10;
    abs = Math.abs(fee);
  }

  return fee;
};

export const normalizeReceivableAggregate = (value: unknown): number => {
  const amount = normalizeMoneyAmount(value);
  const abs = Math.abs(amount);

  // Algunas importaciones históricas dejaron agregados de cuotas corridos por
  // separadores/escala. Normalizamos solo importes enteros con escala exacta.
  if (abs >= 100_000_000 && Number.isInteger(amount / 1000)) return amount / 1000;
  if (abs >= 1_000_000 && abs < 10_000_000 && Number.isInteger(amount / 10)) return amount / 10;
  return amount;
};

export const normalizeMovementAmount = (value: unknown): number => normalizeMoneyAmount(value);
