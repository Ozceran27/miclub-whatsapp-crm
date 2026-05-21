import { google } from "googleapis";
import type { DebtorStatus, Member } from "@miclub/shared";

export const SHEET_NAMES = ["FITNESS", "SALON", "AULA"] as const;

type SourceType = "mock" | "google_sheets";

export interface SyncStatus {
  source: SourceType;
  enabled: boolean;
  sheets: readonly string[];
  lastSyncAt?: string;
  error?: string;
}

const toBool = (value: string | undefined): boolean => value?.toLowerCase() === "true";

const parseRangeLimit = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normalizeStatus = (value: unknown): DebtorStatus => {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, " ");
  if (normalized.includes("adeudando") || normalized.includes("deuda")) return "Adeudando";
  if (normalized.includes("al dia") || normalized.includes("aldia")) return "Al día";
  if (normalized.includes("pendiente")) return "Pendiente";
  return "Desconocido";
};

const normalizeFee = (value: unknown): number | undefined => {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return undefined;
  const normalized = cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const valueAt = (row: string[], relativeIdx: number): string => String(row[relativeIdx] ?? "").trim();

export const getGoogleSheetsConfig = () => {
  const enabled = toBool(process.env.GOOGLE_SHEETS_ENABLED);
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim() ?? "";
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")?.trim() ?? "";
  const rangeStart = parseRangeLimit(process.env.GOOGLE_SHEETS_RANGE_START, 33);
  const rangeEnd = parseRangeLimit(process.env.GOOGLE_SHEETS_RANGE_END, 500);

  return {
    enabled,
    sheetId,
    serviceAccountEmail,
    privateKey,
    rangeStart,
    rangeEnd,
    credentialsPresent: Boolean(sheetId && serviceAccountEmail && privateKey)
  };
};

export const getMembersFromGoogleSheets = async (): Promise<Member[]> => {
  const config = getGoogleSheetsConfig();

  if (!config.enabled) {
    return [];
  }

  if (!config.credentialsPresent) {
    throw new Error("Faltan credenciales de Google Sheets (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).");
  }

  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheetsClient = google.sheets({ version: "v4", auth });
  const ranges = SHEET_NAMES.map((sheet) => `${sheet}!AB${config.rangeStart}:AY${config.rangeEnd}`);
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
      const nombre = valueAt(row, 5);
      const telefono = valueAt(row, 13);
      if (!nombre || !telefono) continue;

      const member: Member = {
        id: valueAt(row, 0) || `${sheetName}-${members.length + 1}`,
        nombre,
        apellido: valueAt(row, 8),
        dni: valueAt(row, 11) || undefined,
        telefono,
        actividad: valueAt(row, 15) || undefined,
        modalidad: valueAt(row, 17) || undefined,
        cuota: normalizeFee(valueAt(row, 19)),
        estado: normalizeStatus(valueAt(row, 21)),
        instructor: valueAt(row, 24) || undefined,
        sourceSheet: sheetName
      };

      members.push(member);
    }
  }

  return members;
};
