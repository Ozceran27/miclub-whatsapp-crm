import { google } from "googleapis";
import { getPostgresPool } from "../db/postgres.js";
import { getGoogleSheetsConfig, SHEET_NAMES } from "../services/googleSheets.js";
import { createImportBatch, finishImportBatch, logImportError } from "./importLogger.js";
import { normalizeComparableText, normalizeDate, normalizeDni, normalizeFee, normalizeFinancialStatus, normalizeMoney, normalizeOperationalStatus, normalizePhone, normalizeSheetText } from "./normalizers.js";

type ImportOptions = { dryRun?: boolean; batchSize?: number };
type ImportSummary = { batchId: string; dryRun: boolean; read: number; peopleUpserted: number; enrollmentsUpserted: number; movementsUpserted: number; errors: number };

type SheetRow = { sheet: string; rowNumber: number; row: unknown[] };
const MEMBER_INDEXES = { id: 0, nombre: 4, apellido: 7, dni: 10, telefono: 12, actividad: 14, modalidad: 16, cuota: 18, estado: 20, vence: 21 } as const;
const MOVEMENT_INDEXES = { id: 0, fecha: 1, tipo: 3, categoria: 6, concepto: 9, contraparte: 14, sector: 17, monto: 19, estadoFinan: 24, estado: 24 } as const;

const valueAt = (row: unknown[], idx: number): string => String(row[idx] ?? "").trim();
const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const stablePart = (value: unknown): string => normalizeComparableText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-datos";
const externalId = (...parts: unknown[]): string => parts.map(stablePart).join(":");

const getSheetsClient = (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  const auth = new google.auth.JWT({ email: config.serviceAccountEmail, key: config.privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
};

const readRows = async (): Promise<{ members: SheetRow[]; movements: SheetRow[] }> => {
  const config = getGoogleSheetsConfig();
  if (!config.enabled || !config.credentialsPresent) throw new Error("Google Sheets no está habilitado o faltan credenciales.");
  const client = getSheetsClient(config);
  const ranges = SHEET_NAMES.flatMap((sheet) => [config.sheetRanges[sheet], config.movementRanges[sheet]]);
  const response = await client.spreadsheets.values.batchGet({ spreadsheetId: config.sheetId, ranges, majorDimension: "ROWS" });
  const members: SheetRow[] = [];
  const movements: SheetRow[] = [];
  for (const valueRange of response.data.valueRanges ?? []) {
    const range = valueRange.range ?? "";
    const sheet = (range.split("!")[0] ?? "").replace(/'/g, "");
    const start = Number(range.match(/![A-Z]+(\d+)/)?.[1] ?? 1);
    const target = range.includes("AB") ? members : movements;
    (valueRange.values ?? []).forEach((row, index) => target.push({ sheet, rowNumber: start + index, row }));
  }
  return { members, movements };
};

const findSectorId = async (pool: Awaited<ReturnType<typeof getPostgresPool>>, sectorName: string): Promise<string | null> => {
  const result = await pool.query<{ id: string }>("select id from miclub.sectors where lower(name) = lower($1) or lower(code) = lower($1) limit 1", [sectorName]);
  return result.rows[0]?.id ?? null;
};

const findActivityId = async (pool: Awaited<ReturnType<typeof getPostgresPool>>, activityName: string, sectorId: string): Promise<string | null> => {
  const result = await pool.query<{ id: string }>("select id from miclub.activities where sector_id = $1 and lower(name) = lower($2) limit 1", [sectorId, activityName]);
  return result.rows[0]?.id ?? null;
};

const upsertPerson = async (pool: Awaited<ReturnType<typeof getPostgresPool>>, row: SheetRow): Promise<string> => {
  const firstName = normalizeSheetText(valueAt(row.row, MEMBER_INDEXES.nombre));
  const lastName = normalizeSheetText(valueAt(row.row, MEMBER_INDEXES.apellido));
  const dni = normalizeDni(valueAt(row.row, MEMBER_INDEXES.dni)) || null;
  if (!firstName) throw new Error("Fila sin nombre de persona.");
  const phone = valueAt(row.row, MEMBER_INDEXES.telefono) || null;
  const existing = dni ? await pool.query<{ id: string }>("select id from miclub.people where dni = $1 limit 1", [dni]) : { rows: [] };
  if (existing.rows[0]) {
    await pool.query("update miclub.people set first_name=$2,last_name=$3,phone=$4,normalized_phone=$5,updated_at=now() where id=$1", [existing.rows[0].id, firstName, lastName || " ", phone, normalizePhone(phone)]);
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>("insert into miclub.people (first_name,last_name,dni,phone,normalized_phone,notes) values ($1,$2,$3,$4,$5,$6) returning id", [firstName, lastName || " ", dni, phone, normalizePhone(phone), `Importado desde Google Sheets ${row.sheet}:${row.rowNumber}`]);
  await pool.query("insert into miclub.person_kind_links (person_id, kind) values ($1, 'alumno') on conflict do nothing", [inserted.rows[0]?.id]);
  return inserted.rows[0]?.id ?? "";
};

const upsertEnrollment = async (pool: Awaited<ReturnType<typeof getPostgresPool>>, row: SheetRow, personId: string): Promise<void> => {
  const sectorId = await findSectorId(pool, row.sheet);
  if (!sectorId) throw new Error(`No existe sector para ${row.sheet}.`);
  const activity = valueAt(row.row, MEMBER_INDEXES.actividad) || "Sin actividad";
  const activityId = await findActivityId(pool, activity, sectorId);
  if (!activityId) throw new Error(`No existe actividad ${activity} en sector ${row.sheet}.`);
  const dni = normalizeDni(valueAt(row.row, MEMBER_INDEXES.dni));
  const ext = externalId("google_sheets", "enrollment", dni || personId, row.sheet, activity);
  const status = normalizeOperationalStatus(valueAt(row.row, MEMBER_INDEXES.estado));
  const dueDate = normalizeDate(valueAt(row.row, MEMBER_INDEXES.vence))?.slice(0, 10) ?? null;
  const existing = await pool.query<{ id: string }>("select id from miclub.enrollments where external_id = $1 limit 1", [ext]);
  const params = [personId, activityId, normalizeFee(valueAt(row.row, MEMBER_INDEXES.cuota)) ?? 0, status === "otro" ? "nuevo_inscripto" : status, dueDate, valueAt(row.row, MEMBER_INDEXES.modalidad) || null];
  if (existing.rows[0]) {
    await pool.query("update miclub.enrollments set person_id=$2,activity_id=$3,fee_amount=$4,status=$5::miclub.enrollment_status,due_date=$6,notes=$7,updated_at=now() where id=$1", [existing.rows[0].id, ...params]);
  } else {
    await pool.query("insert into miclub.enrollments (external_id, person_id, activity_id, fee_amount, status, due_date, source, notes) values ($1,$2,$3,$4,$5::miclub.enrollment_status,$6,'google_sheets',$7)", [ext, ...params]);
  }
};

const upsertMovement = async (pool: Awaited<ReturnType<typeof getPostgresPool>>, row: SheetRow): Promise<void> => {
  const concept = valueAt(row.row, MOVEMENT_INDEXES.concepto);
  const amount = Math.abs(normalizeMoney(valueAt(row.row, MOVEMENT_INDEXES.monto)));
  if (!concept || amount === 0) return;
  const movementDate = normalizeDate(valueAt(row.row, MOVEMENT_INDEXES.fecha)) ?? new Date().toISOString();
  const sectorName = valueAt(row.row, MOVEMENT_INDEXES.sector) || row.sheet;
  const sectorId = await findSectorId(pool, sectorName);
  const typeText = normalizeComparableText(valueAt(row.row, MOVEMENT_INDEXES.tipo));
  const movementType = typeText.startsWith("egreso") ? "EGRESOS" : typeText.startsWith("capital") ? "CAPITAL" : "INGRESOS";
  const ext = externalId("google_sheets", "movement", valueAt(row.row, MOVEMENT_INDEXES.id), normalizeDni(valueAt(row.row, MOVEMENT_INDEXES.contraparte)), sectorName, movementDate.slice(0, 10), concept, amount, row.sheet);
  const params = [movementDate, movementType, sectorId, concept, valueAt(row.row, MOVEMENT_INDEXES.contraparte) || null, amount, normalizeFinancialStatus(valueAt(row.row, MOVEMENT_INDEXES.estadoFinan)), JSON.stringify({ sheet: row.sheet, rowNumber: row.rowNumber, row: row.row })];
  const existing = await pool.query<{ id: string }>("select id from miclub.movements where external_id = $1 limit 1", [ext]);
  if (existing.rows[0]) {
    await pool.query("update miclub.movements set movement_date=$2,movement_type=$3::miclub.movement_type,sector_id=$4,concept=$5,counterparty_text=$6,amount=$7,financial_status=$8::miclub.financial_status,source_payload=$9::jsonb,updated_at=now() where id=$1", [existing.rows[0].id, ...params]);
  } else {
    await pool.query("insert into miclub.movements (external_id,movement_date,movement_type,sector_id,concept,counterparty_text,amount,financial_status,operational_status,source,source_payload) values ($1,$2,$3::miclub.movement_type,$4,$5,$6,$7,$8::miclub.financial_status,'COMPLETADO','google_sheets',$9::jsonb)", [ext, ...params]);
  }
};

export const importGoogleSheets = async (options: ImportOptions = {}): Promise<ImportSummary> => {
  const dryRun = options.dryRun ?? true;
  const batchSize = options.batchSize ?? 50;
  const pool = await getPostgresPool();
  const batchId = await createImportBatch(pool, { source: "google_sheets", dryRun, notes: dryRun ? "Dry run: no se escriben entidades." : undefined });
  const summary: ImportSummary = { batchId, dryRun, read: 0, peopleUpserted: 0, enrollmentsUpserted: 0, movementsUpserted: 0, errors: 0 };
  try {
    const rows = await readRows();
    summary.read = rows.members.length + rows.movements.length;
    for (const group of chunk(rows.members, batchSize)) {
      const groupErrors: Array<{ row: SheetRow; error: unknown }> = [];
      await pool.query("begin");
      try {
        for (const row of group) {
          try {
            const personId = await upsertPerson(pool, row);
            summary.peopleUpserted += 1;
            await upsertEnrollment(pool, row, personId);
            summary.enrollmentsUpserted += 1;
          } catch (error) { summary.errors += 1; groupErrors.push({ row, error }); }
        }
        dryRun ? await pool.query("rollback") : await pool.query("commit");
      } catch (error) { await pool.query("rollback"); throw error; }
      for (const { row, error } of groupErrors) await logImportError(pool, { batchId, sourceTable: "members", sourceRow: `${row.sheet}:${row.rowNumber}`, error, rawPayload: row.row });
    }
    for (const group of chunk(rows.movements, batchSize)) {
      const groupErrors: Array<{ row: SheetRow; error: unknown }> = [];
      await pool.query("begin");
      try {
        for (const row of group) {
          try { await upsertMovement(pool, row); summary.movementsUpserted += 1; }
          catch (error) { summary.errors += 1; groupErrors.push({ row, error }); }
        }
        dryRun ? await pool.query("rollback") : await pool.query("commit");
      } catch (error) { await pool.query("rollback"); throw error; }
      for (const { row, error } of groupErrors) await logImportError(pool, { batchId, sourceTable: "movements", sourceRow: `${row.sheet}:${row.rowNumber}`, error, rawPayload: row.row });
    }
    await finishImportBatch(pool, batchId, dryRun ? "dry_run" : summary.errors > 0 ? "completed_with_errors" : "completed", JSON.stringify(summary));
    return summary;
  } catch (error) {
    await finishImportBatch(pool, batchId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
};
