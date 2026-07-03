import { normalizeMembershipFeeUnit, normalizeMovementAmount, type DebtorStatus, type OperationalStatusKey } from "@miclub/shared";

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
  if (normalized.includes("adeudando") || normalized.includes("adeud") || normalized.includes("deuda") || normalized.includes("pendiente")) return "adeudando";
  if (normalized.includes("al dia") || compact.includes("aldia") || normalized.includes("aldia")) return "al_dia";
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

export const normalizeMoney = normalizeMovementAmount;

export const normalizeFee = (value: unknown): number | undefined => {
  const normalized = normalizeMoney(value);
  return normalized === 0 && String(value ?? "").trim() === "" ? undefined : normalized;
};

export const normalizeMembershipFeeAmount = (value: unknown): number | undefined => {
  const raw = String(value ?? "").trim();
  if (raw === "") return undefined;
  return normalizeMembershipFeeUnit(value);
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

const isValidDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const formatDateParts = (year: number, month: number, day: number): string | undefined =>
  isValidDateParts(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : undefined;

export const parseArgentinianDate = (value: unknown): string | undefined => {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!match) return undefined;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  return formatDateParts(year, Number(monthRaw), Number(dayRaw));
};

export const parseSheetDateToLocalDate = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86_400_000));
    return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const argentinianDate = parseArgentinianDate(raw);
  if (argentinianDate) return argentinianDate;

  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoDate) return formatDateParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));

  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && /^\d+(?:[,.]\d+)?$/.test(raw)) return parseSheetDateToLocalDate(numeric);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
};

export const formatDateOnlyForPostgres = (value: unknown): string | null =>
  parseSheetDateToLocalDate(value) ?? null;

export const formatArgentinaTimestampForPostgres = (value: unknown): string | null => {
  const dateOnly = parseSheetDateToLocalDate(value);
  return dateOnly ? `${dateOnly} 00:00:00 America/Argentina/Buenos_Aires` : null;
};

export const normalizeDate = (value: unknown): string | undefined => {
  const dateOnly = parseSheetDateToLocalDate(value);
  return dateOnly ? `${dateOnly}T00:00:00-03:00` : undefined;
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
