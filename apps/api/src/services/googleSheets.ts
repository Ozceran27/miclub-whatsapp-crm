import { google } from "googleapis";
import type { AdminMovement, ClubOperationsSummary, DebtorStatus, Member, OperationalStatusKey, SectorBalance } from "@miclub/shared";

export const SHEET_NAMES = ["FITNESS", "SALON", "AULA"] as const;
export const SECTOR_BALANCE_SHEET_NAMES = ["FITNESS", "SALON", "AULA", "LOCAL 1", "CANTINA"] as const;

type OperationalSheetName = (typeof SHEET_NAMES)[number];
type SourceType = "mock" | "google_sheets";
type SectorBalanceSheetName = (typeof SECTOR_BALANCE_SHEET_NAMES)[number];

type MovementColumnKey = "fecha" | "tipo" | "categoria" | "contraparte" | "monto" | "estadoFinan" | "estado" | "concepto";

type MovementColumnIndexes = Partial<Record<MovementColumnKey, number>>;

export interface LastPaymentInfo {
  dni: string;
  lastPaymentAt: string;
  lastPaymentAmount?: number;
  lastPaymentSourceSheet: string;
  lastPaymentConcept?: string;
}

interface ParsedPayment extends LastPaymentInfo {
  rawDate: string;
}

export interface PaymentsDebugInfo {
  totalPaymentsRead: number;
  totalValidPayments: number;
  bySheet: Record<string, { totalPaymentsRead: number; totalValidPayments: number }>;
  samplePayments: ParsedPayment[];
  lastPaymentByDniCount: number;
}

export interface SyncStatus {
  source: SourceType;
  enabled: boolean;
  sheets: readonly string[];
  lastSyncAt?: string;
  error?: string;
}

export interface ClubFinanceDebugInfo {
  totalMovementsRead: number;
  validMovements: number;
  byTipo: Record<string, number>;
  byEstado: Record<string, number>;
  bySector: Record<string, number>;
  byCategoria: Record<string, number>;
  rawLiquidityCells: unknown[][];
  parsedLiquidity: number;
  parsedCash: number;
  parsedBank: number;
  parsedDollars: number;
  sectorBalanceCells: Record<string, unknown>;
  liquidity: number;
  cuotasAdeudadas: number;
  pendingNetBalance: number;
  saldosAPagar: number;
  projectedBalance: number;
  formula: string;
}

const MOVEMENT_HEADER_RANGES: Record<OperationalSheetName, string> = {
  FITNESS: "FITNESS!B19:AB19",
  SALON: "SALON!B33:AB33",
  AULA: "AULA!B33:AB33"
};

const toBool = (value: string | undefined): boolean => value?.toLowerCase() === "true";

export const normalizeSheetText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeText = normalizeSheetText;

const normalizeHeader = (value: unknown): string => normalizeSheetText(value).toLowerCase().replace(/[^a-z0-9]/g, "");

export const normalizeDni = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

const normalizeComparableText = (value: unknown): string => normalizeSheetText(value).toLowerCase().replace(/\s+/g, " ");

export const normalizeOperationalStatus = (value: unknown): OperationalStatusKey => {
  const normalized = normalizeComparableText(value)
    .replace(/[-–—_/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = normalized.replace(/\s/g, "");

  if (!normalized) return "otro";
  if (normalized.includes("nuevo") && (normalized.includes("inscripto") || normalized.includes("inscrito"))) return "nuevo_inscripto";
  if (normalized.includes("abandon")) return "abandonado";
  if (normalized.includes("adeudando") || normalized.includes("adeud") || normalized.includes("deuda")) return "adeudando";
  if (normalized.includes("al dia") || compact.includes("aldia")) return "al_dia";

  return "otro";
};

export const toMemberStatus = (value: unknown): DebtorStatus => {
  switch (normalizeOperationalStatus(value)) {
    case "adeudando":
      return "Adeudando";
    case "al_dia":
      return "Al día";
    case "nuevo_inscripto":
      return "Nuevo Inscripto";
    case "abandonado":
      return "Abandonado";
    default:
      return normalizeComparableText(value).includes("pendiente") ? "Pendiente" : "Desconocido";
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

  if (commaCount > 0 && dotCount > 0) {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else if (dotCount > 1) {
    cleaned = cleaned.replace(/\./g, "");
  } else if (commaCount > 1) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (dotCount === 1) {
    cleaned = parseSingleSeparatorNumber(cleaned, ".");
  } else if (commaCount === 1) {
    cleaned = parseSingleSeparatorNumber(cleaned, ",");
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;

  return isNegative && parsed !== 0 ? -parsed : parsed;
};

const normalizeFee = (value: unknown): number | undefined => {
  const normalized = normalizeMoney(value);
  return normalized === 0 && String(value ?? "").trim() === "" ? undefined : normalized;
};

export const normalizeDate = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.round((value - 25569) * 86_400_000)).toISOString();
  }

  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && raw.match(/^\d+(?:[,.]\d+)?$/)) {
    return new Date(Math.round((numeric - 25569) * 86_400_000)).toISOString();
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (slashMatch) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw = "0", minuteRaw = "0", secondRaw = "0"] = slashMatch;
    const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
    const month = Number(monthRaw) - 1;
    const day = Number(dayRaw);
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);
    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export const parseGoogleSheetDate = normalizeDate;

const valueAt = (row: unknown[], relativeIdx: number): string => String(row[relativeIdx] ?? "").trim();

const MEMBER_COLUMN_INDEXES = {
  // Índices relativos a los rangos AB:AY de inscriptos. AV es el índice 20 dentro de AB:AY.
  id: 0,
  nombre: 4,
  apellido: 7,
  dni: 10,
  telefono: 12,
  actividad: 14,
  modalidad: 16,
  cuota: 18,
  estado: 20,
  instructor: 23
} as const;

const sheetNameFromRange = (range: string): OperationalSheetName | undefined => {
  const sheetName = (range.split("!")[0] ?? "").replace(/'/g, "");
  return SHEET_NAMES.find((name) => name === sheetName);
};

const movementColumnAliases: Record<MovementColumnKey, string[]> = {
  fecha: ["fecha"],
  tipo: ["tipo"],
  categoria: ["categoria"],
  contraparte: ["contraparte"],
  monto: ["monto"],
  estadoFinan: ["estadofinan", "estadofinanciero", "estadofin"],
  estado: ["estado"],
  concepto: ["concepto"]
};

const movementFallbackIndexes: MovementColumnIndexes = {
  // Índices relativos al rango B:AB de MOVIMIENTOS. Se usan solo si no se pudo ubicar el header dinámicamente.
  fecha: 1,
  tipo: 2,
  categoria: 3,
  concepto: 4,
  contraparte: 5,
  monto: 6,
  estadoFinan: 7,
  estado: 8
};

const getMovementColumnIndexes = (headerRow: unknown[] | undefined): MovementColumnIndexes => {
  const indexes: MovementColumnIndexes = {};
  const normalizedHeaders = (headerRow ?? []).map(normalizeHeader);

  for (const [key, aliases] of Object.entries(movementColumnAliases) as Array<[MovementColumnKey, string[]]>) {
    const found = normalizedHeaders.findIndex((header) => aliases.includes(header));
    indexes[key] = found >= 0 ? found : movementFallbackIndexes[key];
  }

  return indexes;
};

const movementValue = (row: unknown[], indexes: MovementColumnIndexes, key: MovementColumnKey): string => {
  const index = indexes[key];
  return index === undefined ? "" : valueAt(row, index);
};

const isValidFeePayment = (row: unknown[], indexes: MovementColumnIndexes): boolean => {
  const tipo = normalizeComparableText(movementValue(row, indexes, "tipo"));
  const categoria = normalizeComparableText(movementValue(row, indexes, "categoria"));
  const concepto = normalizeComparableText(movementValue(row, indexes, "concepto"));
  const estadoFinan = normalizeComparableText(movementValue(row, indexes, "estadoFinan"));
  const estado = normalizeComparableText(movementValue(row, indexes, "estado"));

  const isIngreso = tipo.includes("ingreso");
  const isCuota = categoria.includes("cuota");
  const isPaid = estadoFinan.includes("pagado");
  const isCompleted = estado.includes("completado");
  const excludedConcept = categoria.includes("comision") || categoria.includes("seguro") || concepto.includes("comision") || concepto.includes("seguro");

  return isIngreso && isCuota && isPaid && isCompleted && !excludedConcept;
};

const parsePaymentsFromRows = (sheet: OperationalSheetName, headerRow: unknown[] | undefined, rows: unknown[][]): { payments: ParsedPayment[]; totalPaymentsRead: number } => {
  const indexes = getMovementColumnIndexes(headerRow);
  const payments: ParsedPayment[] = [];

  for (const row of rows) {
    if (row.every((cell) => String(cell ?? "").trim() === "")) continue;

    if (!isValidFeePayment(row, indexes)) continue;

    const dni = normalizeDni(movementValue(row, indexes, "contraparte"));
    const rawDate = movementValue(row, indexes, "fecha");
    const lastPaymentAt = parseGoogleSheetDate(rawDate);
    if (!dni || !lastPaymentAt) continue;

    payments.push({
      dni,
      lastPaymentAt,
      lastPaymentAmount: normalizeFee(movementValue(row, indexes, "monto")),
      lastPaymentSourceSheet: sheet,
      lastPaymentConcept: movementValue(row, indexes, "concepto") || undefined,
      rawDate
    });
  }

  return { payments, totalPaymentsRead: rows.length };
};

const buildLastPaymentByDni = (payments: ParsedPayment[]): Record<string, LastPaymentInfo> =>
  payments.reduce<Record<string, LastPaymentInfo>>((acc, payment) => {
    const previous = acc[payment.dni];
    if (!previous || new Date(payment.lastPaymentAt).getTime() > new Date(previous.lastPaymentAt).getTime()) {
      acc[payment.dni] = {
        dni: payment.dni,
        lastPaymentAt: payment.lastPaymentAt,
        lastPaymentAmount: payment.lastPaymentAmount,
        lastPaymentSourceSheet: payment.lastPaymentSourceSheet,
        lastPaymentConcept: payment.lastPaymentConcept
      };
    }
    return acc;
  }, {});

const enrichMembersWithLastPayments = (members: Member[], lastPaymentByDni: Record<string, LastPaymentInfo>): Member[] =>
  members.map((member) => {
    const dni = normalizeDni(member.dni);
    const lastPayment = dni ? lastPaymentByDni[dni] : undefined;
    if (!lastPayment) return member;

    return {
      ...member,
      lastPaymentAt: lastPayment.lastPaymentAt,
      lastPaymentAmount: lastPayment.lastPaymentAmount,
      lastPaymentSourceSheet: lastPayment.lastPaymentSourceSheet,
      lastPaymentConcept: lastPayment.lastPaymentConcept
    };
  });

export const getGoogleSheetsConfig = () => {
  const enabled = toBool(process.env.GOOGLE_SHEETS_ENABLED);
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim() ?? "";
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")?.trim() ?? "";
  const sheetRanges: Record<OperationalSheetName, string> = {
    FITNESS: process.env.GOOGLE_SHEETS_FITNESS_RANGE?.trim() || "FITNESS!AB20:AY800",
    SALON: process.env.GOOGLE_SHEETS_SALON_RANGE?.trim() || "SALON!AB34:AY800",
    AULA: process.env.GOOGLE_SHEETS_AULA_RANGE?.trim() || "AULA!AB34:AY800"
  };
  const movementRanges: Record<OperationalSheetName, string> = {
    FITNESS: process.env.GOOGLE_SHEETS_FITNESS_MOVEMENTS_RANGE?.trim() || "FITNESS!B20:AB800",
    SALON: process.env.GOOGLE_SHEETS_SALON_MOVEMENTS_RANGE?.trim() || "SALON!B34:AB800",
    AULA: process.env.GOOGLE_SHEETS_AULA_MOVEMENTS_RANGE?.trim() || "AULA!B34:AB800"
  };

  return {
    enabled,
    sheetId,
    serviceAccountEmail,
    privateKey,
    sheetRanges,
    movementRanges,
    movementHeaderRanges: MOVEMENT_HEADER_RANGES,
    adminMovementsRange: process.env.GOOGLE_SHEETS_ADMIN_MOVEMENTS_RANGE?.trim() || "ADMINISTRACIÓN!B12:AB3000",
    adminBalancesRange: process.env.GOOGLE_SHEETS_ADMIN_BALANCES_RANGE?.trim() || "ADMINISTRACIÓN!AD12:AG14",
    sectorBalanceRanges: {
      FITNESS: "FITNESS!X3",
      SALON: "SALON!X3",
      AULA: "AULA!X3",
      "LOCAL 1": "'LOCAL 1'!X3",
      CANTINA: "CANTINA!X3"
    } satisfies Record<SectorBalanceSheetName, string>,
    credentialsPresent: Boolean(sheetId && serviceAccountEmail && privateKey)
  };
};

const getSheetsClient = (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  return google.sheets({ version: "v4", auth });
};

const readLastPaymentsFromGoogleSheets = async (config: ReturnType<typeof getGoogleSheetsConfig>): Promise<{ lastPaymentByDni: Record<string, LastPaymentInfo>; debug: PaymentsDebugInfo }> => {
  const sheetsClient = getSheetsClient(config);
  const ranges = SHEET_NAMES.flatMap((sheet) => [config.movementHeaderRanges[sheet], config.movementRanges[sheet]]);
  const response = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId: config.sheetId,
    ranges,
    majorDimension: "ROWS"
  });

  const headerRows: Partial<Record<OperationalSheetName, unknown[]>> = {};
  const movementRows: Partial<Record<OperationalSheetName, unknown[][]>> = {};

  for (const valueRange of response.data.valueRanges ?? []) {
    const range = valueRange.range ?? "";
    const sheetName = sheetNameFromRange(range);
    if (!sheetName) continue;

    if (range.includes(MOVEMENT_HEADER_RANGES[sheetName].split("!")[1].split(":")[0])) {
      headerRows[sheetName] = valueRange.values?.[0] ?? [];
    } else {
      movementRows[sheetName] = valueRange.values ?? [];
    }
  }

  const allPayments: ParsedPayment[] = [];
  const bySheet: PaymentsDebugInfo["bySheet"] = {};
  let totalPaymentsRead = 0;

  for (const sheet of SHEET_NAMES) {
    const { payments, totalPaymentsRead: sheetRowsRead } = parsePaymentsFromRows(sheet, headerRows[sheet], movementRows[sheet] ?? []);
    allPayments.push(...payments);
    totalPaymentsRead += sheetRowsRead;
    bySheet[sheet] = { totalPaymentsRead: sheetRowsRead, totalValidPayments: payments.length };
  }

  const lastPaymentByDni = buildLastPaymentByDni(allPayments);

  return {
    lastPaymentByDni,
    debug: {
      totalPaymentsRead,
      totalValidPayments: allPayments.length,
      bySheet,
      samplePayments: allPayments.slice(0, 10),
      lastPaymentByDniCount: Object.keys(lastPaymentByDni).length
    }
  };
};

export const getPaymentsDebugFromGoogleSheets = async (): Promise<PaymentsDebugInfo> => {
  const config = getGoogleSheetsConfig();

  if (!config.enabled) {
    return { totalPaymentsRead: 0, totalValidPayments: 0, bySheet: {}, samplePayments: [], lastPaymentByDniCount: 0 };
  }

  if (!config.credentialsPresent) {
    throw new Error("Faltan credenciales de Google Sheets (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).");
  }

  const { debug } = await readLastPaymentsFromGoogleSheets(config);
  return debug;
};

export const getMembersFromGoogleSheets = async (): Promise<Member[]> => {
  const config = getGoogleSheetsConfig();

  if (!config.enabled) {
    return [];
  }

  if (!config.credentialsPresent) {
    throw new Error("Faltan credenciales de Google Sheets (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).");
  }

  const sheetsClient = getSheetsClient(config);
  const ranges = SHEET_NAMES.map((sheet) => config.sheetRanges[sheet]);
  const response = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId: config.sheetId,
    ranges,
    majorDimension: "ROWS"
  });

  const members: Member[] = [];

  for (const valueRange of response.data.valueRanges ?? []) {
    const range = valueRange.range ?? "";
    const sheetName = (range.split("!")[0] ?? "").replace(/'/g, "") as Member["sourceSheet"];

    for (const row of valueRange.values ?? []) {
      const nombre = valueAt(row, MEMBER_COLUMN_INDEXES.nombre);
      const telefono = valueAt(row, MEMBER_COLUMN_INDEXES.telefono);
      if (!nombre || !telefono) continue;

      const member: Member = {
        id: valueAt(row, MEMBER_COLUMN_INDEXES.id) || `${sheetName}-${members.length + 1}`,
        nombre,
        apellido: valueAt(row, MEMBER_COLUMN_INDEXES.apellido),
        dni: valueAt(row, MEMBER_COLUMN_INDEXES.dni) || undefined,
        telefono,
        actividad: valueAt(row, MEMBER_COLUMN_INDEXES.actividad) || undefined,
        modalidad: valueAt(row, MEMBER_COLUMN_INDEXES.modalidad) || undefined,
        cuota: normalizeFee(valueAt(row, MEMBER_COLUMN_INDEXES.cuota)),
        estado: toMemberStatus(valueAt(row, MEMBER_COLUMN_INDEXES.estado)),
        instructor: valueAt(row, MEMBER_COLUMN_INDEXES.instructor) || undefined,
        sourceSheet: sheetName
      };

      members.push(member);
    }
  }

  const { lastPaymentByDni } = await readLastPaymentsFromGoogleSheets(config);
  return enrichMembersWithLastPayments(members, lastPaymentByDni);
};

const ADMIN_MOVEMENT_INDEXES = {
  id: 0,
  fecha: 1,
  tipo: 3,
  categoria: 6,
  concepto: 9,
  contraparte: 14,
  sector: 17,
  monto: 19,
  impuestos: 22,
  estado: 24,
  medioPago: 26
} as const;

const normalizedEquals = (value: unknown, expected: string): boolean => normalizeComparableText(value) === normalizeComparableText(expected);

export const isCompleted = (value: unknown): boolean => normalizedEquals(value, "COMPLETADO");
export const isPending = (value: unknown): boolean => normalizedEquals(value, "PENDIENTE");
export const isIncome = (value: unknown): boolean => normalizedEquals(value, "INGRESOS") || normalizeComparableText(value).startsWith("ingreso");
export const isExpense = (value: unknown): boolean => normalizedEquals(value, "EGRESOS") || normalizeComparableText(value).startsWith("egreso");

const adminValueAt = (row: unknown[], index: number): string => String(row[index] ?? "").trim();

const isEmptyRow = (row: unknown[]): boolean => row.every((cell) => String(cell ?? "").trim() === "");

const parseAdminMovementRow = (row: unknown[], rowNumber: number): AdminMovement | null => {
  if (isEmptyRow(row)) return null;

  const id = adminValueAt(row, ADMIN_MOVEMENT_INDEXES.id) || `ADMINISTRACION-${rowNumber}`;
  const tipo = adminValueAt(row, ADMIN_MOVEMENT_INDEXES.tipo);
  const categoria = adminValueAt(row, ADMIN_MOVEMENT_INDEXES.categoria);
  const concepto = adminValueAt(row, ADMIN_MOVEMENT_INDEXES.concepto);
  const sector = adminValueAt(row, ADMIN_MOVEMENT_INDEXES.sector) || "Sin sector";
  const estado = adminValueAt(row, ADMIN_MOVEMENT_INDEXES.estado);
  const monto = normalizeMoney(row[ADMIN_MOVEMENT_INDEXES.monto]);
  const impuestos = normalizeMoney(row[ADMIN_MOVEMENT_INDEXES.impuestos]);

  if (!tipo && !categoria && !concepto && monto === 0 && !estado) return null;

  return {
    id,
    fecha: normalizeDate(row[ADMIN_MOVEMENT_INDEXES.fecha]) ?? (adminValueAt(row, ADMIN_MOVEMENT_INDEXES.fecha) || undefined),
    tipo,
    categoria: categoria || "Sin categoría",
    concepto,
    contraparte: adminValueAt(row, ADMIN_MOVEMENT_INDEXES.contraparte) || undefined,
    sector,
    monto,
    impuestos: impuestos || undefined,
    estado,
    medioPago: adminValueAt(row, ADMIN_MOVEMENT_INDEXES.medioPago) || undefined
  };
};

const parseAdminMovementsFromValues = (values: unknown[][]): AdminMovement[] => {
  const rows = values.slice(1);
  return rows
    .map((row, index) => parseAdminMovementRow(row, index + 13))
    .filter((movement): movement is AdminMovement => movement !== null);
};

const buildBreakdown = <T extends { name: string; amount: number }>(movements: AdminMovement[], key: "sector" | "categoria", predicate: (movement: AdminMovement) => boolean): T[] => {
  const totals = new Map<string, number>();

  for (const movement of movements) {
    if (!predicate(movement)) continue;
    const name = (key === "sector" ? movement.sector : movement.categoria).trim() || "Sin datos";
    totals.set(name, (totals.get(name) ?? 0) + movement.monto);
  }

  return Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }) as T)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "es"));
};

const countBy = (movements: AdminMovement[], getter: (movement: AdminMovement) => string): Record<string, number> =>
  movements.reduce<Record<string, number>>((acc, movement) => {
    const key = getter(movement).trim() || "(vacío)";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

export const PROJECTED_BALANCE_FORMULA = "liquidity + cuotasAdeudadas + pendingNetBalance - saldosAPagar";

export const calculateProjectedBalance = ({
  liquidity,
  cuotasAdeudadas,
  pendingNetBalance,
  saldosAPagar
}: {
  liquidity: number;
  cuotasAdeudadas: number;
  pendingNetBalance: number;
  saldosAPagar: number;
}): number => liquidity + cuotasAdeudadas + pendingNetBalance - saldosAPagar;

const buildEmptyClubOperationsSummary = (cuotasAdeudadas = 0): ClubOperationsSummary => ({
  liquidity: 0,
  cash: 0,
  bank: 0,
  dollars: 0,
  pendingIncome: 0,
  pendingExpenses: 0,
  pendingNetBalance: 0,
  cuotasAdeudadas,
  saldosAPagar: 0,
  projectedBalance: calculateProjectedBalance({ liquidity: 0, cuotasAdeudadas, pendingNetBalance: 0, saldosAPagar: 0 }),
  sectorBalances: [],
  incomeBySector: [],
  expenseBySector: [],
  incomeByCategory: [],
  expenseByCategory: [],
  totalIncomeSectors: 0,
  remainingIncomeSectors: 0,
  totalExpenseSectors: 0,
  remainingExpenseSectors: 0,
  totalIncomeCategories: 0,
  remainingIncomeCategories: 0,
  totalExpenseCategories: 0,
  remainingExpenseCategories: 0
});

const parseLiquidityBalances = (balanceRows: unknown[][]) => ({
  liquidity: normalizeMoney(balanceRows[0]?.[0]),
  cash: normalizeMoney(balanceRows[0]?.[3]),
  bank: normalizeMoney(balanceRows[1]?.[3]),
  dollars: normalizeMoney(balanceRows[2]?.[3])
});

const buildClubOperationsSummary = (movements: AdminMovement[], balanceRows: unknown[][], sectorBalances: SectorBalance[], cuotasAdeudadas = 0): ClubOperationsSummary => {
  const { liquidity, cash, bank, dollars } = parseLiquidityBalances(balanceRows);
  const pendingMovements = movements.filter((movement) => isPending(movement.estado));
  const pendingIncome = pendingMovements
    .filter((movement) => isIncome(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingExpenses = pendingMovements
    .filter((movement) => isExpense(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingNetBalance = pendingIncome - pendingExpenses;
  const saldosAPagar = sectorBalances.reduce((sum, balance) => sum + balance.amount, 0);
  const completedIncome = (movement: AdminMovement) => isIncome(movement.tipo) && isCompleted(movement.estado);
  const completedExpense = (movement: AdminMovement) => isExpense(movement.tipo) && isCompleted(movement.estado);
  const allIncomeBySector = buildBreakdown(movements, "sector", completedIncome);
  const allExpenseBySector = buildBreakdown(movements, "sector", completedExpense);
  const allIncomeByCategory = buildBreakdown(movements, "categoria", completedIncome);
  const allExpenseByCategory = buildBreakdown(movements, "categoria", completedExpense);

  return {
    liquidity,
    cash,
    bank,
    dollars,
    pendingIncome,
    pendingExpenses,
    pendingNetBalance,
    cuotasAdeudadas,
    saldosAPagar,
    projectedBalance: calculateProjectedBalance({ liquidity, cuotasAdeudadas, pendingNetBalance, saldosAPagar }),
    sectorBalances,
    incomeBySector: allIncomeBySector.slice(0, 4),
    expenseBySector: allExpenseBySector.slice(0, 4),
    incomeByCategory: allIncomeByCategory.slice(0, 4),
    expenseByCategory: allExpenseByCategory.slice(0, 4),
    totalIncomeSectors: allIncomeBySector.length,
    remainingIncomeSectors: Math.max(allIncomeBySector.length - 4, 0),
    totalExpenseSectors: allExpenseBySector.length,
    remainingExpenseSectors: Math.max(allExpenseBySector.length - 4, 0),
    totalIncomeCategories: allIncomeByCategory.length,
    remainingIncomeCategories: Math.max(allIncomeByCategory.length - 4, 0),
    totalExpenseCategories: allExpenseByCategory.length,
    remainingExpenseCategories: Math.max(allExpenseByCategory.length - 4, 0)
  };
};

const ensureGoogleSheetsEnabled = (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  if (!config.credentialsPresent) {
    throw new Error("Faltan credenciales de Google Sheets (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).");
  }
};

const readClubFinanceRanges = async (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  const sheetsClient = getSheetsClient(config);
  const response = await sheetsClient.spreadsheets.values.batchGet({
    spreadsheetId: config.sheetId,
    ranges: [config.adminMovementsRange, config.adminBalancesRange, ...SECTOR_BALANCE_SHEET_NAMES.map((sheet) => config.sectorBalanceRanges[sheet])],
    majorDimension: "ROWS"
  });

  const valueRanges = response.data.valueRanges ?? [];
  const movementValues = valueRanges[0]?.values ?? [];
  const balanceRows = valueRanges[1]?.values ?? [];
  const sectorBalanceCells: Record<string, unknown> = {};
  const sectorBalances = SECTOR_BALANCE_SHEET_NAMES.map((sector, index) => {
    const rawValue = valueRanges[index + 2]?.values?.[0]?.[0] ?? "";
    sectorBalanceCells[sector] = rawValue;
    return { sector, amount: normalizeMoney(rawValue) };
  });

  return { movementValues, balanceRows, sectorBalances, sectorBalanceCells };
};

export const getAdminMovementsFromGoogleSheets = async (): Promise<AdminMovement[]> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return [];
  ensureGoogleSheetsEnabled(config);

  const { movementValues } = await readClubFinanceRanges(config);
  return parseAdminMovementsFromValues(movementValues);
};

export const getClubOperationsSummaryFromGoogleSheets = async (cuotasAdeudadas = 0): Promise<ClubOperationsSummary> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return buildEmptyClubOperationsSummary(cuotasAdeudadas);
  ensureGoogleSheetsEnabled(config);

  const { movementValues, balanceRows, sectorBalances } = await readClubFinanceRanges(config);
  return buildClubOperationsSummary(parseAdminMovementsFromValues(movementValues), balanceRows, sectorBalances, cuotasAdeudadas);
};

export const getClubFinanceDebugFromGoogleSheets = async (cuotasAdeudadas = 0): Promise<ClubFinanceDebugInfo> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) {
    return {
      totalMovementsRead: 0,
      validMovements: 0,
      byTipo: {},
      byEstado: {},
      bySector: {},
      byCategoria: {},
      rawLiquidityCells: [],
      parsedLiquidity: 0,
      parsedCash: 0,
      parsedBank: 0,
      parsedDollars: 0,
      sectorBalanceCells: {},
      liquidity: 0,
      cuotasAdeudadas,
      pendingNetBalance: 0,
      saldosAPagar: 0,
      projectedBalance: calculateProjectedBalance({ liquidity: 0, cuotasAdeudadas, pendingNetBalance: 0, saldosAPagar: 0 }),
      formula: PROJECTED_BALANCE_FORMULA
    };
  }
  ensureGoogleSheetsEnabled(config);

  const { movementValues, balanceRows, sectorBalances, sectorBalanceCells } = await readClubFinanceRanges(config);
  const movements = parseAdminMovementsFromValues(movementValues);
  const { liquidity: parsedLiquidity, cash: parsedCash, bank: parsedBank, dollars: parsedDollars } = parseLiquidityBalances(balanceRows);
  const pendingMovements = movements.filter((movement) => isPending(movement.estado));
  const pendingIncome = pendingMovements
    .filter((movement) => isIncome(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingExpenses = pendingMovements
    .filter((movement) => isExpense(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingNetBalance = pendingIncome - pendingExpenses;
  const saldosAPagar = sectorBalances.reduce((sum, balance) => sum + balance.amount, 0);
  const projectedBalance = calculateProjectedBalance({ liquidity: parsedLiquidity, cuotasAdeudadas, pendingNetBalance, saldosAPagar });
  return {
    totalMovementsRead: Math.max(movementValues.length - 1, 0),
    validMovements: movements.length,
    byTipo: countBy(movements, (movement) => movement.tipo),
    byEstado: countBy(movements, (movement) => movement.estado),
    bySector: countBy(movements, (movement) => movement.sector),
    byCategoria: countBy(movements, (movement) => movement.categoria),
    rawLiquidityCells: balanceRows,
    parsedLiquidity,
    parsedCash,
    parsedBank,
    parsedDollars,
    sectorBalanceCells,
    liquidity: parsedLiquidity,
    cuotasAdeudadas,
    pendingNetBalance,
    saldosAPagar,
    projectedBalance,
    formula: PROJECTED_BALANCE_FORMULA
  };
};
