import { google } from "googleapis";
import type { DebtorStatus, Member, OperationalStatusKey } from "@miclub/shared";

export const SHEET_NAMES = ["FITNESS", "SALON", "AULA"] as const;

type OperationalSheetName = (typeof SHEET_NAMES)[number];
type SourceType = "mock" | "google_sheets";

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

const MOVEMENT_HEADER_RANGES: Record<OperationalSheetName, string> = {
  FITNESS: "FITNESS!B19:AB19",
  SALON: "SALON!B33:AB33",
  AULA: "AULA!B33:AB33"
};

const toBool = (value: string | undefined): boolean => value?.toLowerCase() === "true";

const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeHeader = (value: unknown): string => normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, "");

export const normalizeDni = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

const normalizeComparableText = (value: unknown): string => normalizeText(value).toLowerCase().replace(/\s+/g, " ");

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

const normalizeFee = (value: unknown): number | undefined => {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return undefined;

  const withoutThousandsSeparators = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const parsed = Number(withoutThousandsSeparators.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseGoogleSheetDate = (value: unknown): string | undefined => {
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
