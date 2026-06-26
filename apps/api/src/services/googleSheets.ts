import { google } from "googleapis";
import type { AdminMovement, ClubOperationsSummary, Member, SectorBalance } from "@miclub/shared";
import { normalizeComparableText, normalizeDate, normalizeDni, normalizeFee, normalizeHeader, normalizeMoney, normalizeOperationalStatus, parseGoogleSheetDate, normalizeSheetText, toMemberStatus } from "../importers/normalizers.js";
export { normalizeDate, normalizeDni, normalizeMoney, normalizeOperationalStatus, parseGoogleSheetDate, normalizeSheetText, toMemberStatus };

export const SHEET_NAMES = ["FITNESS", "SALON", "AULA"] as const;
export const SECTOR_BALANCE_SHEET_NAMES = ["FITNESS", "SALON", "AULA", "LOCAL 1", "CANTINA"] as const;

type OperationalSheetName = (typeof SHEET_NAMES)[number];
type SourceType = "mock" | "google_sheets" | "postgres";
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
  cuotasACobrar: number;
  pendingNetBalance: number;
  saldosAPagar: number;
  projectedBalance: number;
  formula: string;
  aulaCommissionMap: Record<string, number>;
  receivableDebtorsSamples: Array<{ id: string; nombre: string; actividad?: string; sourceSheet: string; cuota: number; commissionRate: number; receivableFee: number }>;
  totalReceivableFromDebtors: number;
  futureReceivablesUntilMonthEnd: number;
  pendingNetBalanceFromMovements: number;
  pendingNetBalanceFinal: number;
  projectedBalanceFormula: string;
  missingAulaCommissions: string[];
}

const MOVEMENT_HEADER_RANGES: Record<OperationalSheetName, string> = {
  FITNESS: "FITNESS!B19:AB19",
  SALON: "SALON!B33:AB33",
  AULA: "AULA!B33:AB33"
};

const toBool = (value: string | undefined): boolean => value?.toLowerCase() === "true";

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
  vence: 21,
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
        vence: normalizeDate(valueAt(row, MEMBER_COLUMN_INDEXES.vence)),
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


export const normalizeActivityName = (value: unknown): string =>
  normalizeSheetText(value)
    .toLowerCase()
    .replace(/[-–—_/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const parseCommissionRate = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1 ? value / 100 : value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = normalizeMoney(raw.replace("%", ""));
  if (!Number.isFinite(parsed)) return 0;
  return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
};

export const parseAulaCommissionMap = (rows: unknown[][]): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (normalizeSheetText(row[0]).toUpperCase() !== "EC") continue;
    const activityKey = normalizeActivityName(row[1]);
    if (!activityKey) continue;
    map[activityKey] = parseCommissionRate(row[10]);
  }
  return map;
};

export const getReceivableCommissionRate = (member: Member, aulaCommissionMap: Record<string, number>): number => {
  const sourceSheet = normalizeSheetText(member.sourceSheet).toUpperCase();
  if (sourceSheet === "FITNESS") return 0.5;
  if (sourceSheet === "SALON") return 0;
  if (sourceSheet === "AULA") return aulaCommissionMap[normalizeActivityName(member.actividad)] ?? 0;
  return 0;
};

export const calculateReceivableFee = (member: Member, aulaCommissionMap: Record<string, number>): number => {
  const fee = normalizeMoney(member.cuota);
  if (fee <= 0) return 0;
  return fee * getReceivableCommissionRate(member, aulaCommissionMap);
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const getMemberDueDate = (member: Member): Date | undefined => {
  const directDate = normalizeDate(member.vence ?? member.expirationDate ?? member.dueDate);
  if (directDate) return new Date(directDate);
  if (member.lastPaymentAt) return addDays(new Date(member.lastPaymentAt), 31);
  return undefined;
};

export const calculateFutureReceivableFeesUntilMonthEnd = (members: Member[], aulaCommissionMap: Record<string, number>, today = new Date()): number => {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return members
    .filter((member) => normalizeOperationalStatus(member.estado) === "al_dia")
    .reduce((sum, member) => {
      const dueDate = getMemberDueDate(member);
      if (!dueDate || dueDate < start || dueDate > end) return sum;
      return sum + calculateReceivableFee(member, aulaCommissionMap);
    }, 0);
};

export const calculateReceivableFeesFromDebtors = (members: Member[], aulaCommissionMap: Record<string, number>): number =>
  members
    .filter((member) => normalizeOperationalStatus(member.estado) === "adeudando")
    .reduce((sum, member) => sum + calculateReceivableFee(member, aulaCommissionMap), 0);

export const PROJECTED_BALANCE_FORMULA = "liquidity + cuotasACobrar + pendingNetBalance - saldosAPagar";

export const calculateProjectedBalance = ({
  liquidity,
  cuotasACobrar,
  pendingNetBalance,
  saldosAPagar
}: {
  liquidity: number;
  cuotasACobrar: number;
  pendingNetBalance: number;
  saldosAPagar: number;
}): number => liquidity + cuotasACobrar + pendingNetBalance - saldosAPagar;

const buildEmptyClubOperationsSummary = (cuotasACobrar = 0, futureReceivableFeesUntilMonthEnd = 0): ClubOperationsSummary => ({
  liquidity: 0,
  cash: 0,
  bank: 0,
  dollars: 0,
  pendingIncome: 0,
  pendingExpenses: 0,
  pendingNetBalance: futureReceivableFeesUntilMonthEnd,
  cuotasAdeudadas: cuotasACobrar,
  cuotasACobrar,
  futureReceivableFeesUntilMonthEnd,
  saldosAPagar: 0,
  projectedBalance: calculateProjectedBalance({ liquidity: 0, cuotasACobrar, pendingNetBalance: futureReceivableFeesUntilMonthEnd, saldosAPagar: 0 }),
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

const buildClubOperationsSummary = (movements: AdminMovement[], balanceRows: unknown[][], sectorBalances: SectorBalance[], cuotasACobrar = 0, futureReceivableFeesUntilMonthEnd = 0): ClubOperationsSummary => {
  const { liquidity, cash, bank, dollars } = parseLiquidityBalances(balanceRows);
  const pendingMovements = movements.filter((movement) => isPending(movement.estado));
  const pendingIncome = pendingMovements
    .filter((movement) => isIncome(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingExpenses = pendingMovements
    .filter((movement) => isExpense(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingNetBalanceFromMovements = pendingIncome - pendingExpenses;
  const pendingNetBalance = pendingNetBalanceFromMovements + futureReceivableFeesUntilMonthEnd;
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
    cuotasAdeudadas: cuotasACobrar,
    cuotasACobrar,
    futureReceivableFeesUntilMonthEnd,
    saldosAPagar,
    projectedBalance: calculateProjectedBalance({ liquidity, cuotasACobrar, pendingNetBalance, saldosAPagar }),
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
    ranges: [config.adminMovementsRange, config.adminBalancesRange, ...SECTOR_BALANCE_SHEET_NAMES.map((sheet) => config.sectorBalanceRanges[sheet]), "AULA!B18:V30"],
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

  const aulaCommissionRows = valueRanges[SECTOR_BALANCE_SHEET_NAMES.length + 2]?.values ?? [];

  return { movementValues, balanceRows, sectorBalances, sectorBalanceCells, aulaCommissionRows };
};

export const getAdminMovementsFromGoogleSheets = async (): Promise<AdminMovement[]> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return [];
  ensureGoogleSheetsEnabled(config);

  const { movementValues } = await readClubFinanceRanges(config);
  return parseAdminMovementsFromValues(movementValues);
};

export const getClubOperationsSummaryFromGoogleSheets = async (members: Member[] = []): Promise<ClubOperationsSummary> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return buildEmptyClubOperationsSummary(calculateReceivableFeesFromDebtors(members, {}), calculateFutureReceivableFeesUntilMonthEnd(members, {}));
  ensureGoogleSheetsEnabled(config);

  const { movementValues, balanceRows, sectorBalances, aulaCommissionRows } = await readClubFinanceRanges(config);
  const aulaCommissionMap = parseAulaCommissionMap(aulaCommissionRows);
  const cuotasACobrar = calculateReceivableFeesFromDebtors(members, aulaCommissionMap);
  const futureReceivableFeesUntilMonthEnd = calculateFutureReceivableFeesUntilMonthEnd(members, aulaCommissionMap);
  return buildClubOperationsSummary(parseAdminMovementsFromValues(movementValues), balanceRows, sectorBalances, cuotasACobrar, futureReceivableFeesUntilMonthEnd);
};

export const getClubFinanceDebugFromGoogleSheets = async (members: Member[] = []): Promise<ClubFinanceDebugInfo> => {
  const config = getGoogleSheetsConfig();
  const emptyAulaCommissionMap: Record<string, number> = {};
  const emptyCuotasACobrar = calculateReceivableFeesFromDebtors(members, emptyAulaCommissionMap);
  const emptyFutureReceivables = calculateFutureReceivableFeesUntilMonthEnd(members, emptyAulaCommissionMap);

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
      cuotasAdeudadas: emptyCuotasACobrar,
      cuotasACobrar: emptyCuotasACobrar,
      pendingNetBalance: emptyFutureReceivables,
      saldosAPagar: 0,
      projectedBalance: calculateProjectedBalance({ liquidity: 0, cuotasACobrar: emptyCuotasACobrar, pendingNetBalance: emptyFutureReceivables, saldosAPagar: 0 }),
      formula: PROJECTED_BALANCE_FORMULA,
      aulaCommissionMap: emptyAulaCommissionMap,
      receivableDebtorsSamples: [],
      totalReceivableFromDebtors: emptyCuotasACobrar,
      futureReceivablesUntilMonthEnd: emptyFutureReceivables,
      pendingNetBalanceFromMovements: 0,
      pendingNetBalanceFinal: emptyFutureReceivables,
      projectedBalanceFormula: PROJECTED_BALANCE_FORMULA,
      missingAulaCommissions: []
    };
  }
  ensureGoogleSheetsEnabled(config);

  const { movementValues, balanceRows, sectorBalances, sectorBalanceCells, aulaCommissionRows } = await readClubFinanceRanges(config);
  const movements = parseAdminMovementsFromValues(movementValues);
  const aulaCommissionMap = parseAulaCommissionMap(aulaCommissionRows);
  const cuotasACobrar = calculateReceivableFeesFromDebtors(members, aulaCommissionMap);
  const futureReceivablesUntilMonthEnd = calculateFutureReceivableFeesUntilMonthEnd(members, aulaCommissionMap);
  const { liquidity: parsedLiquidity, cash: parsedCash, bank: parsedBank, dollars: parsedDollars } = parseLiquidityBalances(balanceRows);
  const pendingMovements = movements.filter((movement) => isPending(movement.estado));
  const pendingIncome = pendingMovements
    .filter((movement) => isIncome(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingExpenses = pendingMovements
    .filter((movement) => isExpense(movement.tipo))
    .reduce((sum, movement) => sum + movement.monto, 0);
  const pendingNetBalanceFromMovements = pendingIncome - pendingExpenses;
  const pendingNetBalance = pendingNetBalanceFromMovements + futureReceivablesUntilMonthEnd;
  const saldosAPagar = sectorBalances.reduce((sum, balance) => sum + balance.amount, 0);
  const projectedBalance = calculateProjectedBalance({ liquidity: parsedLiquidity, cuotasACobrar, pendingNetBalance, saldosAPagar });
  const missingAulaCommissions = Array.from(
    new Set(
      members
        .filter((member) => normalizeSheetText(member.sourceSheet).toUpperCase() === "AULA")
        .filter((member) => normalizeMoney(member.cuota) > 0)
        .filter((member) => aulaCommissionMap[normalizeActivityName(member.actividad)] === undefined)
        .map((member) => member.actividad ?? "Sin actividad")
    )
  );

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
    cuotasAdeudadas: cuotasACobrar,
    cuotasACobrar,
    pendingNetBalance,
    saldosAPagar,
    projectedBalance,
    formula: PROJECTED_BALANCE_FORMULA,
    aulaCommissionMap,
    receivableDebtorsSamples: members
      .filter((member) => normalizeOperationalStatus(member.estado) === "adeudando")
      .slice(0, 10)
      .map((member) => ({
        id: member.id,
        nombre: `${member.nombre} ${member.apellido}`.trim(),
        actividad: member.actividad,
        sourceSheet: member.sourceSheet,
        cuota: normalizeMoney(member.cuota),
        commissionRate: getReceivableCommissionRate(member, aulaCommissionMap),
        receivableFee: calculateReceivableFee(member, aulaCommissionMap)
      })),
    totalReceivableFromDebtors: cuotasACobrar,
    futureReceivablesUntilMonthEnd,
    pendingNetBalanceFromMovements,
    pendingNetBalanceFinal: pendingNetBalance,
    projectedBalanceFormula: PROJECTED_BALANCE_FORMULA,
    missingAulaCommissions
  };
};

const MONTH_NAMES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] as const;

export interface SectorOperationalDebugInfo {
  source: SourceType;
  monthUsed: string;
  rawRanges: Record<string, unknown[][]>;
  parsedBalances: Record<string, number>;
  currentMonthUtilities: Record<string, { value: number; warning?: string }>;
  movementCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  salonActivitiesSample: Array<{ type: string; name: string; members: number }>;
  aulaActivitiesSample: Array<{ type: string; name: string; members?: number; commission: number }>;
  aulaPopularity?: { mostPopularActivity: { name: string; members: number } | null; rawRange: unknown[][] };
  cantina?: { kioskIncome: number; drinksIncome: number; cmv: number; totalProfitability: number; cmvSource: string; totalProfitabilityFormula: string };
  warnings: string[];
}

export const normalizeStatus = normalizeOperationalStatus;
export const isActiveMember = (member: Pick<Member, "estado">): boolean => normalizeOperationalStatus(member.estado) !== "abandonado";
export const isCategory = (value: unknown, expected: string): boolean => normalizedEquals(value, expected);
export const isSector = (value: unknown, expected: string): boolean => normalizedEquals(value, expected);

export const isWithinLastDays = (dateValue: unknown, days: number): boolean => {
  const normalizedDate = parseGoogleSheetDate(dateValue);
  if (!normalizedDate) return false;
  const dateTime = new Date(normalizedDate).getTime();
  if (!Number.isFinite(dateTime)) return false;
  return Date.now() - dateTime <= days * 24 * 60 * 60 * 1000 && dateTime <= Date.now();
};

const getCurrentSpanishMonth = () => MONTH_NAMES_ES[new Date().getMonth()];

const getRangeKey = (sheetName: string, range: string) => `${sheetName}!${range}`;
const quoteSheetName = (sheetName: string) => sheetName.includes(" ") ? `'${sheetName}'` : sheetName;
const buildRange = (sheetName: string, range: string) => `${quoteSheetName(sheetName)}!${range}`;

const getSectorMembers = (members: Member[], sheet: string) => members.filter((member) => isSector(member.sourceSheet, sheet));
const sumDebt = (members: Member[]) => members.filter((member) => normalizeOperationalStatus(member.estado) === "adeudando").reduce((sum, member) => sum + (member.cuota ?? 0), 0);

const getCellNumber = (ranges: Record<string, unknown[][]>, sheetName: string, cell: string) => normalizeMoney(ranges[getRangeKey(sheetName, cell)]?.[0]?.[0]);

const parseCurrentMonthUtility = (rows: unknown[][], monthName = getCurrentSpanishMonth()): { value: number; warning?: string } => {
  const normalizedMonth = normalizeComparableText(monthName);
  for (const row of rows) {
    const monthIndex = row.findIndex((cell) => normalizeComparableText(cell) === normalizedMonth);
    if (monthIndex < 0) continue;
    for (let index = monthIndex + 1; index < row.length; index += 1) {
      const raw = String(row[index] ?? "").trim();
      if (!raw) continue;
      const value = normalizeMoney(raw);
      if (value !== 0 || /0/.test(raw)) return { value };
    }
    return { value: 0, warning: `Se encontró ${monthName}, pero no un valor numérico asociado.` };
  }
  return { value: 0, warning: `No se encontró el mes ${monthName} en el rango de utilidad.` };
};

export const getSectorBalance = async (sheetName: string, cell: string): Promise<number> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return 0;
  ensureGoogleSheetsEnabled(config);
  const sheetsClient = getSheetsClient(config);
  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: buildRange(sheetName, cell) });
  return normalizeMoney(response.data.values?.[0]?.[0]);
};

export const getCurrentMonthUtility = async (sheetName: string, range: string): Promise<number> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return 0;
  ensureGoogleSheetsEnabled(config);
  const sheetsClient = getSheetsClient(config);
  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: buildRange(sheetName, range), majorDimension: "ROWS" });
  return parseCurrentMonthUtility(response.data.values ?? []).value;
};

const parseSalonActivityStats = (rows: unknown[][]) => {
  const activities = rows
    .filter((row) => isCategory(row[0], "EC"))
    .map((row) => ({ name: String(row[1] ?? "").trim(), members: normalizeMoney(row[14]) }))
    .filter((activity) => activity.name);
  const sortedDesc = [...activities].sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, "es"));
  const positive = activities.filter((activity) => activity.members > 0);
  const leastSource = positive.length ? positive : activities;
  const sortedAsc = [...leastSource].sort((a, b) => a.members - b.members || a.name.localeCompare(b.name, "es"));
  return { mostPopularActivity: sortedDesc[0] ?? null, leastPopularActivity: sortedAsc[0] ?? null, activities };
};

const parseAulaActivityStats = (rows: unknown[][]) => {
  const activities = rows
    .filter((row) => isCategory(row[0], "EC"))
    .map((row) => ({ name: String(row[1] ?? "").trim(), members: normalizeMoney(row[14]) }))
    .filter((activity) => activity.name);
  const sortedDesc = [...activities].sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, "es"));
  return { mostPopularActivity: sortedDesc[0] ?? null, activities };
};

const parseAulaCommissionAverage = (rows: unknown[][]) => {
  const commissions = rows
    .filter((row) => isCategory(row[0], "EC"))
    .map((row) => ({ raw: String(row[10] ?? "").trim(), value: normalizeMoney(row[10]) }))
    .filter((commission) => commission.raw !== "" && /\d/.test(commission.raw) && Number.isFinite(commission.value))
    .map((commission) => commission.value);
  return commissions.length ? commissions.reduce((sum, value) => sum + value, 0) / commissions.length : null;
};

export const getSalonActivityStats = async () => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return { mostPopularActivity: null, leastPopularActivity: null };
  ensureGoogleSheetsEnabled(config);
  const sheetsClient = getSheetsClient(config);
  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: "SALON!B18:V30" });
  const { activities: _activities, ...stats } = parseSalonActivityStats(response.data.values ?? []);
  return stats;
};

export const getAulaCommissionAverage = async (): Promise<number | null> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return null;
  ensureGoogleSheetsEnabled(config);
  const sheetsClient = getSheetsClient(config);
  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: "AULA!B18:V30" });
  return parseAulaCommissionAverage(response.data.values ?? []);
};

const isRelevantLocalIncome = (movement: AdminMovement) => isSector(movement.sector, "LOCAL 1") && isIncome(movement.tipo) && (isCategory(movement.categoria, "COMISIÓN") || isCategory(movement.categoria, "VENTAS"));

export const getLocal1Stats = (movements: AdminMovement[]) => {
  const relevant = movements.filter(isRelevantLocalIncome);
  const highlighted = [...relevant].sort((a, b) => b.monto - a.monto)[0];
  return {
    totalRelevantIncomeMovements: relevant.length,
    last30DaysRelevantIncomeMovements: relevant.filter((movement) => isWithinLastDays(movement.fecha, 30)).length,
    highlightedIncome: highlighted ? { amount: highlighted.monto, concept: highlighted.concepto || highlighted.categoria, date: highlighted.fecha ?? "" } : null
  };
};

export const getCantinaStatsFromAdminMovements = (movements: AdminMovement[]) => {
  const kioskIncome = movements.filter((movement) => isSector(movement.sector, "CANTINA") && isIncome(movement.tipo) && isCategory(movement.categoria, "KIOSCO")).reduce((sum, movement) => sum + movement.monto, 0);
  const drinksIncome = movements.filter((movement) => isSector(movement.sector, "CANTINA") && isIncome(movement.tipo) && isCategory(movement.categoria, "BEBIDAS")).reduce((sum, movement) => sum + movement.monto, 0);
  const cmv = movements.filter((movement) => isSector(movement.sector, "CANTINA") && isExpense(movement.tipo) && isCategory(movement.categoria, "BEBIDAS")).reduce((sum, movement) => sum + movement.monto, 0);
  return { kioskIncome, drinksIncome, cmv, totalProfitability: kioskIncome + drinksIncome - cmv };
};

const OPERATIONAL_RANGES = [
  "FITNESS!AN3", "FITNESS!AR9:AY14", "FITNESS!X3",
  "SALON!AW29", "SALON!AN24:AU29", "SALON!B18:V30",
  "AULA!AW29", "AULA!AN24:AU29", "AULA!B18:V30",
  "'LOCAL 1'!AN3", "'LOCAL 1'!AB19:AI24", "'LOCAL 1'!X3",
  "ADMINISTRACIÓN!B12:AB3000"
];

const readSectorOperationalRanges = async (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  const sheetsClient = getSheetsClient(config);
  const response = await sheetsClient.spreadsheets.values.batchGet({ spreadsheetId: config.sheetId, ranges: OPERATIONAL_RANGES, majorDimension: "ROWS" });
  const rawRanges: Record<string, unknown[][]> = {};
  response.data.valueRanges?.forEach((valueRange, index) => {
    const configured = OPERATIONAL_RANGES[index].replace(/'/g, "");
    rawRanges[configured] = valueRange.values ?? [];
  });
  return rawRanges;
};

const buildSectorOperationalSummary = (members: Member[], rawRanges: Record<string, unknown[][]>, movements: AdminMovement[]) => {
  const fitnessMembers = getSectorMembers(members, "FITNESS");
  const salonMembers = getSectorMembers(members, "SALON");
  const aulaMembers = getSectorMembers(members, "AULA");
  const fitnessDebtors = fitnessMembers.filter((member) => normalizeOperationalStatus(member.estado) === "adeudando");
  const allDebtors = members.filter((member) => normalizeOperationalStatus(member.estado) === "adeudando");
  const salonActivityStats = parseSalonActivityStats(rawRanges["SALON!B18:V30"] ?? []);
  const aulaActivityStats = parseAulaActivityStats(rawRanges["AULA!B18:V30"] ?? []);
  const local1Stats = getLocal1Stats(movements);

  return {
    fitness: {
      totalMembers: fitnessMembers.length,
      activeMembers: fitnessMembers.filter(isActiveMember).length,
      totalProfitability: getCellNumber(rawRanges, "FITNESS", "AN3"),
      currentMonthProfitability: parseCurrentMonthUtility(rawRanges["FITNESS!AR9:AY14"] ?? []).value,
      totalDebtors: fitnessDebtors.length,
      totalDebtAmount: sumDebt(fitnessDebtors),
      settlementBalance: getCellNumber(rawRanges, "FITNESS", "X3")
    },
    salon: {
      totalMembers: salonMembers.length,
      activeMembers: salonMembers.filter(isActiveMember).length,
      totalProfitability: getCellNumber(rawRanges, "SALON", "AW29"),
      currentMonthProfitability: parseCurrentMonthUtility(rawRanges["SALON!AN24:AU29"] ?? []).value,
      mostPopularActivity: salonActivityStats.mostPopularActivity,
      leastPopularActivity: salonActivityStats.leastPopularActivity
    },
    aula: {
      totalMembers: aulaMembers.length,
      activeMembers: aulaMembers.filter(isActiveMember).length,
      totalProfitability: getCellNumber(rawRanges, "AULA", "AW29"),
      currentMonthProfitability: parseCurrentMonthUtility(rawRanges["AULA!AN24:AU29"] ?? []).value,
      averageCommission: parseAulaCommissionAverage(rawRanges["AULA!B18:V30"] ?? []),
      mostPopularActivity: aulaActivityStats.mostPopularActivity
    },
    local1: {
      ...local1Stats,
      totalProfitability: getCellNumber(rawRanges, "LOCAL 1", "AN3"),
      currentMonthProfitability: parseCurrentMonthUtility(rawRanges["LOCAL 1!AB19:AI24"] ?? []).value,
      settlementBalance: getCellNumber(rawRanges, "LOCAL 1", "X3")
    },
    cantina: getCantinaStatsFromAdminMovements(movements),
    crm: {
      totalMembers: members.length,
      activeMembers: members.filter(isActiveMember).length,
      totalDebtors: allDebtors.length,
      totalDebtAmount: sumDebt(allDebtors)
    }
  };
};

export const getSectorOperationalSummary = async (members: Member[]) => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled) return buildSectorOperationalSummary(members, {}, []);
  ensureGoogleSheetsEnabled(config);
  const rawRanges = await readSectorOperationalRanges(config);
  const movements = parseAdminMovementsFromValues(rawRanges["ADMINISTRACIÓN!B12:AB3000"] ?? []);
  return buildSectorOperationalSummary(members, rawRanges, movements);
};

export const getSectorOperationalDebug = async (members: Member[]): Promise<SectorOperationalDebugInfo> => {
  const config = getGoogleSheetsConfig();
  const monthUsed = getCurrentSpanishMonth();
  if (!config.enabled) {
    return { source: "mock", monthUsed, rawRanges: {}, parsedBalances: {}, currentMonthUtilities: {}, movementCounts: {}, categoryCounts: {}, salonActivitiesSample: [], aulaActivitiesSample: [], warnings: ["Google Sheets desactivado: usando datos mock/locales."] };
  }
  ensureGoogleSheetsEnabled(config);
  const rawRanges = await readSectorOperationalRanges(config);
  const movements = parseAdminMovementsFromValues(rawRanges["ADMINISTRACIÓN!B12:AB3000"] ?? []);
  const utilities = {
    fitness: parseCurrentMonthUtility(rawRanges["FITNESS!AR9:AY14"] ?? [], monthUsed),
    salon: parseCurrentMonthUtility(rawRanges["SALON!AN24:AU29"] ?? [], monthUsed),
    aula: parseCurrentMonthUtility(rawRanges["AULA!AN24:AU29"] ?? [], monthUsed),
    local1: parseCurrentMonthUtility(rawRanges["LOCAL 1!AB19:AI24"] ?? [], monthUsed)
  };
  const salonActivities = parseSalonActivityStats(rawRanges["SALON!B18:V30"] ?? []).activities;
  const aulaActivityStats = parseAulaActivityStats(rawRanges["AULA!B18:V30"] ?? []);
  const cantinaStats = getCantinaStatsFromAdminMovements(movements);
  const warnings = Object.entries(utilities).flatMap(([sector, utility]) => utility.warning ? [`${sector}: ${utility.warning}`] : []);
  return {
    source: "google_sheets",
    monthUsed,
    rawRanges: Object.fromEntries(Object.entries(rawRanges).map(([key, rows]) => [key, rows.slice(0, 5)])),
    parsedBalances: {
      fitness: getCellNumber(rawRanges, "FITNESS", "AN3"),
      fitnessSettlement: getCellNumber(rawRanges, "FITNESS", "X3"),
      salon: getCellNumber(rawRanges, "SALON", "AW29"),
      aula: getCellNumber(rawRanges, "AULA", "AW29"),
      local1: getCellNumber(rawRanges, "LOCAL 1", "AN3"),
      local1Settlement: getCellNumber(rawRanges, "LOCAL 1", "X3")
    },
    currentMonthUtilities: utilities,
    movementCounts: countBy(movements, (movement) => movement.sector),
    categoryCounts: countBy(movements, (movement) => `${movement.sector} · ${movement.categoria}`),
    salonActivitiesSample: salonActivities.slice(0, 10).map((activity) => ({ type: "EC", name: activity.name, members: activity.members })),
    aulaActivitiesSample: aulaActivityStats.activities.slice(0, 10).map((activity) => ({ type: "EC", name: activity.name, members: activity.members, commission: normalizeMoney((rawRanges["AULA!B18:V30"] ?? []).find((row) => String(row[1] ?? "").trim() === activity.name)?.[10]) })),
    aulaPopularity: { mostPopularActivity: aulaActivityStats.mostPopularActivity, rawRange: rawRanges["AULA!B18:V30"] ?? [] },
    cantina: { ...cantinaStats, cmvSource: "EGRESOS / BEBIDAS / CANTINA", totalProfitabilityFormula: "KIOSCO + BEBIDAS - CMV" },
    warnings
  };
};
