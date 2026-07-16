export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export const OPERATING_CATEGORIES = [
  "INSCRIPCION", "CUOTA", "TURNOS", "COMISION", "ALQUILER", "EVENTOS", "VENTAS", "CLASES", "CURSOS", "BEBIDAS", "KIOSCO", "CMV",
] as const;

export type VariationDirection = "up" | "down" | "stable";
export type VariationImpact = "favorable" | "unfavorable" | "neutral";

export type VariationResult = {
  current: number;
  previous: number;
  absoluteChange: number;
  percentageChange: number | null;
  direction: VariationDirection;
  comparable: boolean;
  impact?: VariationImpact;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const normalizeCategoryName = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, " ")
  .toUpperCase();

export const isOperatingCategory = (value: unknown): boolean =>
  (OPERATING_CATEGORIES as readonly string[]).includes(normalizeCategoryName(value));

const zonedParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ARGENTINA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
};

const utcFromArgentinaDay = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);

const formatArgentinaDate = (date: Date): string => {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const formatArgentinaLabel = (date: Date): string => {
  const { year, month, day } = zonedParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
};

export const getCurrentMonthWindow = (reference = new Date()) => {
  const { year, month } = zonedParts(reference);
  const start = utcFromArgentinaDay(year, month, 1);
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const end = utcFromArgentinaDay(nextMonth.year, nextMonth.month, 1);
  const label = new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIME_ZONE, month: "long" }).format(start);
  return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) };
};

export const getRolling30DayWindows = (reference = new Date()) => {
  const { year, month, day } = zonedParts(reference);
  const currentEnd = new Date(reference);
  const currentStart = addDays(currentEnd, -30);
  const previousStart = addDays(currentStart, -30);
  return {
    previousStart,
    currentStart,
    currentEnd,
    tomorrowStart: currentEnd,
    current: { from: currentStart, to: currentEnd, labelFrom: formatArgentinaLabel(currentStart), labelTo: formatArgentinaLabel(currentEnd), dateFrom: formatArgentinaDate(currentStart), dateTo: formatArgentinaDate(currentEnd) },
    previous: { from: previousStart, to: currentStart, labelFrom: formatArgentinaLabel(previousStart), labelTo: formatArgentinaLabel(addDays(currentStart, -1)), dateFrom: formatArgentinaDate(previousStart), dateTo: formatArgentinaDate(addDays(currentStart, -1)) },
    timezone: ARGENTINA_TIME_ZONE,
  };
};

export const getLastCompleteMonthWindows = (reference = new Date()) => {
  const { year, month } = zonedParts(reference);
  const currentMonthStart = utcFromArgentinaDay(year, month, 1);
  const currentStart = month === 1 ? utcFromArgentinaDay(year - 1, 12, 1) : utcFromArgentinaDay(year, month - 1, 1);
  const previousStart = currentStart.getUTCMonth() === 0
    ? utcFromArgentinaDay(currentStart.getUTCFullYear() - 1, 12, 1)
    : utcFromArgentinaDay(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 1);
  const label = (date: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIME_ZONE, month: "long", year: "numeric" }).format(date);
  return { previousStart, currentStart, currentEnd: currentMonthStart, currentLabel: label(currentStart), previousLabel: label(previousStart) };
};

export const calculateVariation = (currentInput: number, previousInput: number, inverseImpact = false): VariationResult => {
  const current = roundMoney(currentInput);
  const previous = roundMoney(previousInput);
  const absoluteChange = roundMoney(current - previous);
  const direction: VariationDirection = absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "stable";
  const comparable = !(previous === 0 && current !== 0);
  const percentageChange = previous === 0 ? (current === 0 ? 0 : null) : (absoluteChange / Math.abs(previous)) * 100;
  const positiveImpact = inverseImpact ? direction === "down" : direction === "up";
  const impact: VariationImpact = direction === "stable" ? "neutral" : positiveImpact ? "favorable" : "unfavorable";
  return { current, previous, absoluteChange, percentageChange, direction, comparable, impact };
};
