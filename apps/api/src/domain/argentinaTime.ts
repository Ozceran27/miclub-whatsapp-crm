/** The single civil time zone used for backend business reporting. */
export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type TimeWindow = Readonly<{ from: Date; to: Date }>;

export type ArgentinaDateParts = Readonly<{ year: number; month: number; day: number }>;

const DAY_MS = 86_400_000;

export const getArgentinaDateParts = (instant = new Date()): ArgentinaDateParts => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
};

/** Convert an Argentina civil midnight to its instant without relying on the process TZ. */
export const argentinaDayStart = (year: number, month: number, day: number): Date => {
  const civilAsUtc = Date.UTC(year, month - 1, day);
  const offsetAt = (instant: Date): number => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ARGENTINA_TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const representedAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    return representedAsUtc - instant.getTime();
  };
  let candidate = new Date(civilAsUtc - offsetAt(new Date(civilAsUtc)));
  candidate = new Date(civilAsUtc - offsetAt(candidate));
  return candidate;
};

const shiftedCivilDate = ({ year, month, day }: ArgentinaDateParts, days: number): ArgentinaDateParts => {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
};

export const addArgentinaCalendarDays = (instant: Date, days: number): Date => {
  if (!Number.isInteger(days)) throw new RangeError("days must be an integer");
  const shifted = shiftedCivilDate(getArgentinaDateParts(instant), days);
  return argentinaDayStart(shifted.year, shifted.month, shifted.day);
};

export const getArgentinaDayWindow = (reference = new Date()): TimeWindow => {
  const parts = getArgentinaDateParts(reference);
  const next = shiftedCivilDate(parts, 1);
  return { from: argentinaDayStart(parts.year, parts.month, parts.day), to: argentinaDayStart(next.year, next.month, next.day) };
};

export const getArgentinaMonthWindow = (reference = new Date()): TimeWindow => {
  const { year, month } = getArgentinaDateParts(reference);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return { from: argentinaDayStart(year, month, 1), to: argentinaDayStart(next.year, next.month, 1) };
};

export const getArgentinaCalendarYear = (reference = new Date()): number => getArgentinaDateParts(reference).year;

export const getArgentinaYearWindow = (year = getArgentinaCalendarYear()): TimeWindow & { year: number } => ({
  from: argentinaDayStart(year, 1, 1),
  to: argentinaDayStart(year + 1, 1, 1),
  year,
});

export const getArgentinaYearToDateWindow = (reference = new Date()): TimeWindow => ({
  from: argentinaDayStart(getArgentinaCalendarYear(reference), 1, 1),
  to: new Date(reference),
});

/** N complete Argentina civil dates, including the date containing `reference`. */
export const getArgentinaLastNDaysWindow = (days: number, reference = new Date()): TimeWindow => {
  if (!Number.isInteger(days) || days < 1) throw new RangeError("days must be a positive integer");
  const current = getArgentinaDateParts(reference);
  const first = shiftedCivilDate(current, -(days - 1));
  const afterLast = shiftedCivilDate(current, 1);
  return {
    from: argentinaDayStart(first.year, first.month, first.day),
    to: argentinaDayStart(afterLast.year, afterLast.month, afterLast.day),
  };
};

export const formatArgentinaDate = (instant: Date): string => {
  const { year, month, day } = getArgentinaDateParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
