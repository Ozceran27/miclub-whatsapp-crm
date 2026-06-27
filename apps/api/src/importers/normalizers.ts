import type { DebtorStatus, OperationalStatusKey } from "@miclub/shared";

export const normalizeSheetText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export const normalizeText = normalizeSheetText;
export const normalizeHeader = (value: unknown): string => normalizeSheetText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
export const normalizeDni = (value: unknown): string => String(value ?? "").replace(/\D/g, "");
export const normalizePhone = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2).replace(/^0?15/, "")}`;
  return `549${digits.replace(/^0/, "").replace(/^15/, "")}`;
};
export const normalizeComparableText = (value: unknown): string => normalizeSheetText(value).toLowerCase().replace(/\s+/g, " ");

export const normalizeOperationalStatus = (value: unknown): OperationalStatusKey => {
  const normalized = normalizeComparableText(value).replace(/[-–—_/]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/\s/g, "");
  if (!normalized) return "otro";
  if (normalized.includes("nuevo") && (normalized.includes("inscripto") || normalized.includes("inscrito"))) return "nuevo_inscripto";
  if (normalized.includes("abandon")) return "abandonado";
  if (normalized.includes("cancel")) return "cancelado";
  if (normalized.includes("adeudando") || normalized.includes("adeud") || normalized.includes("deuda")) return "adeudando";
  if (normalized.includes("al dia") || compact.includes("aldia")) return "al_dia";
  return "otro";
};

export const toMemberStatus = (value: unknown): DebtorStatus => {
  switch (normalizeOperationalStatus(value)) {
    case "adeudando": return "Adeudando";
    case "al_dia": return "Al día";
    case "nuevo_inscripto": return "Nuevo Inscripto";
    case "abandonado": return "Abandonado";
    case "cancelado": return "Cancelado";
    default: return normalizeComparableText(value).includes("pendiente") ? "Pendiente" : "Desconocido";
  }
};

const countOccurrences = (value: string, character: string): number => value.split(character).length - 1;
const parseSingleSeparatorNumber = (value: string, separator: "," | "."): string => {
  const separatorIndex = value.indexOf(separator);
  const integerPart = value.slice(0, separatorIndex);
  const fractionalPart = value.slice(separatorIndex + 1);
  if (fractionalPart.length === 3 && /^\d{1,3}$/.test(integerPart)) return `${integerPart}${fractionalPart}`;
  if (fractionalPart.length >= 1 && fractionalPart.length <= 2) return `${integerPart}.${fractionalPart}`;
  return `${integerPart}${fractionalPart}`;
};

export const normalizeMoney = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const isNegative = /[-−–—]/.test(raw) || /^\s*\(.*\)\s*$/.test(raw);
  let cleaned = raw.replace(/[−–—]/g, "-").replace(/[^\d,.-]/g, "").replace(/-/g, "");
  if (!/\d/.test(cleaned)) return 0;
  const commaCount = countOccurrences(cleaned, ",");
  const dotCount = countOccurrences(cleaned, ".");
  if (commaCount > 0 && dotCount > 0) cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  else if (dotCount > 1) cleaned = cleaned.replace(/\./g, "");
  else if (commaCount > 1) cleaned = cleaned.replace(/,/g, "");
  else if (dotCount === 1) cleaned = parseSingleSeparatorNumber(cleaned, ".");
  else if (commaCount === 1) cleaned = parseSingleSeparatorNumber(cleaned, ",");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return isNegative && parsed !== 0 ? -parsed : parsed;
};

export const normalizeFee = (value: unknown): number | undefined => {
  const normalized = normalizeMoney(value);
  return normalized === 0 && String(value ?? "").trim() === "" ? undefined : normalized;
};

export const normalizeDate = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Math.round((value - 25569) * 86_400_000)).toISOString();
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && raw.match(/^\d+(?:[,.]\d+)?$/)) return new Date(Math.round((numeric - 25569) * 86_400_000)).toISOString();
  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (slashMatch) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw = "0", minuteRaw = "0", secondRaw = "0"] = slashMatch;
    const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
    const date = new Date(Date.UTC(year, Number(monthRaw) - 1, Number(dayRaw), Number(hourRaw), Number(minuteRaw), Number(secondRaw)));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};
export const parseGoogleSheetDate = normalizeDate;

export const normalizeFinancialStatus = (value: unknown): "sin_movimientos" | "pendiente" | "pagado" | "parcial" | "a_liquidar" | "liquidado" | "deuda" => {
  const normalized = normalizeComparableText(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "sin_movimientos";
  if (normalized.includes("liquidado")) return "liquidado";
  if (normalized.includes("liquidar")) return "a_liquidar";
  if (normalized.includes("parcial")) return "parcial";
  if (normalized.includes("pagado") || normalized.includes("completado")) return "pagado";
  if (normalized.includes("deuda") || normalized.includes("adeud")) return "deuda";
  return "pendiente";
};
