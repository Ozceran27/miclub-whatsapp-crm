export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export const OPERATING_PROFIT_CATEGORIES = [
  "INSCRIPCIÓN",
  "CUOTA",
  "TURNOS",
  "COMISIÓN",
  "ALQUILER",
  "EVENTOS",
  "VENTAS",
  "CLASES",
  "CURSOS",
  "KIOSCO",
  "BEBIDAS",
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
  .replace(/\.+$/g, "")
  .toUpperCase();

export const normalizeCategory = normalizeCategoryName;

export const OPERATING_CATEGORIES = OPERATING_PROFIT_CATEGORIES.map((category) =>
  normalizeCategoryName(category),
);

export const NON_OPERATING_EXPENSE_CATEGORIES = [
  "PUBLICIDAD",
  "SALARIOS",
  "MANTENIM.",
  "DEPÓSITOS",
  "EXTRACCIONES",
  "DÓLARES",
  "REPARACIONES",
  "VIÁTICOS",
  "GANANCIA",
  "PÉRDIDA",
  "CMV",
  "SEGUROS",
  "LIMPIEZA",
  "LIBRERÍA",
  "OTROS",
] as const;

export const DEBT_LIABILITY_CATEGORIES = ["DEUDA", "DEUDAS"] as const;
export const SERVICE_CATEGORIES = ["LUZ", "AGUA", "INTERNET"] as const;
export const TAX_CATEGORIES = ["IMPUESTO", "IMPUESTOS"] as const;
export const TAX_CATEGORY_KEYS = TAX_CATEGORIES.map((category) => normalizeCategoryName(category));

export const NON_OPERATING_EXPENSE_CATEGORY_KEYS = NON_OPERATING_EXPENSE_CATEGORIES.map((category) => normalizeCategoryName(category));
export const DEBT_LIABILITY_CATEGORY_KEYS = DEBT_LIABILITY_CATEGORIES.map((category) => normalizeCategoryName(category));
export const SERVICE_CATEGORY_KEYS = SERVICE_CATEGORIES.map((category) => normalizeCategoryName(category));


export const getOperatingCategories = (): readonly string[] => OPERATING_PROFIT_CATEGORIES;



export const EXPENSE_TYPE_KEYS = ["OPERATING", "NON_OPERATING", "DEBT", "SERVICES", "TAXES"] as const;
export type ExpenseTypeKey = typeof EXPENSE_TYPE_KEYS[number] | "UNCLASSIFIED";

export const EXPENSE_TYPE_LABELS: Record<Exclude<ExpenseTypeKey, "UNCLASSIFIED">, string> = {
  OPERATING: "Gastos Operativos",
  NON_OPERATING: "Gastos No Operativos",
  DEBT: "Deudas / Pasivos",
  SERVICES: "Servicios",
  TAXES: "Impuestos",
};

export const classifyExpenseCategory = (value: unknown): ExpenseTypeKey => {
  const normalized = normalizeCategoryName(value);
  if ((DEBT_LIABILITY_CATEGORY_KEYS as readonly string[]).includes(normalized)) return "DEBT";
  if ((SERVICE_CATEGORY_KEYS as readonly string[]).includes(normalized)) return "SERVICES";
  if ((TAX_CATEGORY_KEYS as readonly string[]).includes(normalized)) return "TAXES";
  if ((OPERATING_CATEGORIES as readonly string[]).includes(normalized)) return "OPERATING";
  if ((NON_OPERATING_EXPENSE_CATEGORY_KEYS as readonly string[]).includes(normalized)) return "NON_OPERATING";
  return "UNCLASSIFIED";
};

export const getArgentinaCalendarYear = (reference = new Date()): number => zonedParts(reference).year;

export const getArgentinaYearWindow = (year = getArgentinaCalendarYear()) => ({
  start: utcFromArgentinaDay(year, 1, 1),
  end: utcFromArgentinaDay(year + 1, 1, 1),
  year,
});

export const MONTH_LABELS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export type RollingInterannualMonth = { year: number; month: number; key: string; label: string; fullLabel: string };

const addArgentinaMonths = (year: number, month: number, offset: number): { year: number; month: number } => {
  const zeroBased = year * 12 + (month - 1) + offset;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
};

export const getRollingInterannualMonthWindow = (reference = new Date()) => {
  const current = zonedParts(reference);
  const start = { year: current.year - 1, month: current.month };
  const endExclusive = addArgentinaMonths(current.year, current.month, 1);
  const shortFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIME_ZONE, month: "short", year: "numeric" });
  const fullFormatter = new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIME_ZONE, month: "long", year: "numeric" });
  const months: RollingInterannualMonth[] = [];
  for (let offset = 0; offset <= 12; offset += 1) {
    const part = addArgentinaMonths(start.year, start.month, offset);
    const date = utcFromArgentinaDay(part.year, part.month, 1);
    const label = shortFormatter.format(date).replace(/\.$/, "").replace(/^./, (char) => char.toLocaleUpperCase("es-AR"));
    const fullLabel = fullFormatter.format(date).replace(/^./, (char) => char.toLocaleUpperCase("es-AR"));
    months.push({ year: part.year, month: part.month, key: `${part.year}-${String(part.month).padStart(2, "0")}`, label, fullLabel });
  }
  return {
    fromMonth: `${start.year}-${String(start.month).padStart(2, "0")}-01`,
    toExclusive: `${endExclusive.year}-${String(endExclusive.month).padStart(2, "0")}-01`,
    start: utcFromArgentinaDay(start.year, start.month, 1),
    end: utcFromArgentinaDay(endExclusive.year, endExclusive.month, 1),
    timezone: ARGENTINA_TIME_ZONE,
    months,
  };
};

export const isOperatingCategory = (value: unknown): boolean =>
  (OPERATING_CATEGORIES as readonly string[]).includes(normalizeCategoryName(value));

export const isNonOperatingExpenseCategory = (value: unknown): boolean =>
  (NON_OPERATING_EXPENSE_CATEGORY_KEYS as readonly string[]).includes(normalizeCategoryName(value));

export const isServiceCategory = (value: unknown): boolean =>
  (SERVICE_CATEGORY_KEYS as readonly string[]).includes(normalizeCategoryName(value));

export const isTaxCategory = (value: unknown): boolean =>
  (TAX_CATEGORY_KEYS as readonly string[]).includes(normalizeCategoryName(value));

export const isDebtCategory = (value: unknown): boolean =>
  (DEBT_LIABILITY_CATEGORY_KEYS as readonly string[]).includes(normalizeCategoryName(value));

export const normalizeMovementStatus = (value: unknown): string => normalizeCategoryName(value);

export const isCompletedMovementStatus = (value: unknown): boolean =>
  ["COMPLETADO", "COMPLETED"].includes(normalizeMovementStatus(value));

export type SectorProfitabilityMovement = {
  sector?: unknown;
  sectorName?: unknown;
  sector_name?: unknown;
  movement_type?: unknown;
  movementType?: unknown;
  tipo?: unknown;
  category?: unknown;
  categoria?: unknown;
  categoryName?: unknown;
  operational_status?: unknown;
  operationalStatus?: unknown;
  estado?: unknown;
  amount?: unknown;
  monto?: unknown;
};

export const isCompletedMovement = (movement: SectorProfitabilityMovement): boolean =>
  isCompletedMovementStatus(movement.operational_status ?? movement.operationalStatus ?? movement.estado);

export const normalizeMovementType = (value: unknown): string => normalizeCategoryName(value);

export const isIncomeMovement = (movement: SectorProfitabilityMovement): boolean =>
  normalizeMovementType(movement.movement_type ?? movement.movementType ?? movement.tipo).startsWith("INGRESO") ||
  normalizeMovementType(movement.movement_type ?? movement.movementType ?? movement.tipo) === "INCOME";

export const isExpenseMovement = (movement: SectorProfitabilityMovement): boolean =>
  normalizeMovementType(movement.movement_type ?? movement.movementType ?? movement.tipo).startsWith("EGRESO") ||
  normalizeMovementType(movement.movement_type ?? movement.movementType ?? movement.tipo) === "EXPENSE";

export const normalizeAmount = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/[$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
};
const toFiniteNumber = normalizeAmount;


export const calculateCategoryBalance = (movements: SectorProfitabilityMovement[], categories: readonly string[]) => {
  const categoryKeys = new Set(categories.map((category) => normalizeCategoryName(category)));
  let income = 0;
  let expenses = 0;
  let movementsCount = 0;
  for (const movement of movements) {
    const category = movement.category ?? movement.categoryName ?? movement.categoria;
    if (!isCompletedMovement(movement) || !categoryKeys.has(normalizeCategoryName(category))) continue;
    const amount = Math.abs(normalizeAmount(movement.amount ?? movement.monto));
    if (isIncomeMovement(movement)) income += amount;
    else if (isExpenseMovement(movement)) expenses += amount;
    else continue;
    movementsCount += 1;
  }
  return { income: roundMoney(income), expenses: roundMoney(expenses), balance: roundMoney(income - expenses), movementsCount };
};

export const calculateOperatingProfitability = (movements: SectorProfitabilityMovement[], options: { sector?: unknown } = {}) => {
  const sectorFilter = options.sector == null ? null : normalizeCategoryName(options.sector);
  let income = 0;
  let expenses = 0;
  let movementsCount = 0;
  for (const movement of movements) {
    const category = movement.category ?? movement.categoryName ?? movement.categoria;
    if (!isCompletedMovement(movement) || !isOperatingCategory(category)) continue;
    if (sectorFilter) {
      const sector = movement.sectorName ?? movement.sector_name ?? movement.sector;
      if (normalizeCategoryName(sector) !== sectorFilter) continue;
    }
    const amount = Math.abs(normalizeAmount(movement.amount ?? movement.monto));
    if (isIncomeMovement(movement)) income += amount;
    else if (isExpenseMovement(movement)) expenses += amount;
    else continue;
    movementsCount += 1;
  }
  return { income: roundMoney(income), expenses: roundMoney(expenses), expense: roundMoney(expenses), profitability: roundMoney(income - expenses), movementsCount };
};

export const calculateOperatingProfitabilityBySector = (movements: SectorProfitabilityMovement[], options: { sector?: unknown } = {}) => {
  const result = calculateOperatingProfitability(movements, options);
  return { sector: String(options.sector ?? "Sin sector"), ...result };
};

export const calculateSectorProfitability = (movements: SectorProfitabilityMovement[]) => {
  const sectors = new Map<string, { name: string; income: number; expenses: number; balance: number; movements: number }>();
  for (const movement of movements) {
    const status = movement.operational_status ?? movement.operationalStatus ?? movement.estado;
    const category = movement.category ?? movement.categoryName ?? movement.categoria;
    if (!isCompletedMovementStatus(status) || !isOperatingCategory(category)) continue;
    const type = normalizeCategoryName(movement.movement_type ?? movement.movementType ?? movement.tipo);
    if (!isIncomeMovement(movement) && !isExpenseMovement(movement)) continue;
    const name = String(movement.sectorName ?? movement.sector_name ?? movement.sector ?? "").trim() || "Sin sector";
    const current = sectors.get(name) ?? { name, income: 0, expenses: 0, balance: 0, movements: 0 };
    const amount = Math.abs(toFiniteNumber(movement.amount ?? movement.monto));
    if (isIncomeMovement(movement)) current.income += amount;
    if (isExpenseMovement(movement)) current.expenses += amount;
    current.balance = current.income - current.expenses;
    current.movements += 1;
    sectors.set(name, current);
  }
  return Array.from(sectors.values()).sort((a, b) => b.balance - a.balance || b.income - a.income);
};

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
