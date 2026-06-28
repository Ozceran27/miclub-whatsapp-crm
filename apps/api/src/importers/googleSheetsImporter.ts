import { google } from "googleapis";
import { getPostgresPool } from "../db/postgres.js";
import { getGoogleSheetsConfig, movementValue, resolveMovementColumnIndexes, SHEET_NAMES, type MovementColumnIndexes } from "../services/googleSheets.js";
import { upsertActivity, upsertInstructor, upsertSector } from "../repositories/activitiesRepository.js";
import { createImportBatch, finishImportBatch, logImportError } from "./importLogger.js";
import { normalizeComparableText, normalizeDate, normalizeDni, normalizeFee, normalizeFinancialStatus, normalizeMoney, normalizeOperationalStatus, normalizePhone, normalizeSheetText } from "./normalizers.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export type MissingEnrollmentStrategy = "noop" | "abandon" | "inactive" | "warn";
type ImportOptions = { dryRun?: boolean; batchSize?: number; missingEnrollmentStrategy?: MissingEnrollmentStrategy };
type ImportSummary = {
  batchId: string;
  dryRun: boolean;
  read: number;
  attemptedWrites: number;
  persistedWrites: number;
  rolledBackWrites: number;
  sectorsProcessed: number;
  movementCategoriesProcessed: number;
  peopleProcessed: number;
  instructorsProcessed: number;
  activitiesProcessed: number;
  enrollmentsProcessed: number;
  movementsProcessed: number;
  missingEnrollments: number;
  missingEnrollmentsAction: MissingEnrollmentStrategy;
  errors: number;
  warnings: string[];
};
type SheetRow = { kind: "members" | "movements"; sheet: string; rowNumber: number; row: unknown[]; movementIndexes?: MovementColumnIndexes; usedMovementFallback?: boolean };

const MEMBER_INDEXES = { id: 0, nombre: 4, apellido: 7, dni: 10, telefono: 12, actividad: 14, modalidad: 16, cuota: 18, estado: 20, vence: 21, instructor: 23 } as const;
const valueAt = (row: unknown[], idx: number): string => String(row[idx] ?? "").trim();
const isEmpty = (row: unknown[]): boolean => row.every((cell) => String(cell ?? "").trim() === "");
const stablePart = (value: unknown): string => normalizeComparableText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-datos";
const externalId = (...parts: unknown[]): string => parts.map(stablePart).join(":");
const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const getSheetsClient = (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  const auth = new google.auth.JWT({ email: config.serviceAccountEmail, key: config.privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
};

const importEnabled = (): boolean => ["true", "1", "yes", "on"].includes((process.env.GOOGLE_SHEETS_IMPORT_ENABLED ?? "true").toLowerCase());

export const parseMissingEnrollmentStrategy = (value = process.env.GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY): MissingEnrollmentStrategy => {
  const normalized = normalizeComparableText(value ?? "warn").replace(/-/g, "_");
  if (["noop", "none", "ignore", "nothing", "no_hacer_nada"].includes(normalized)) return "noop";
  if (["abandon", "abandoned", "abandonado", "mark_abandoned", "marcar_abandonado"].includes(normalized)) return "abandon";
  if (["inactive", "inactivo", "mark_inactive", "marcar_inactive", "marcar_inactivo"].includes(normalized)) return "inactive";
  if (["warn", "warning", "advertir", "advertencia"].includes(normalized)) return "warn";
  return "warn";
};

const readRows = async (): Promise<SheetRow[]> => {
  const config = getGoogleSheetsConfig();
  if (!importEnabled()) throw new Error("GOOGLE_SHEETS_IMPORT_ENABLED deshabilita la importación desde Google Sheets.");
  if (!config.credentialsPresent) throw new Error("Faltan credenciales de Google Sheets (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).");
  const client = getSheetsClient(config);
  const memberRanges = SHEET_NAMES.map((sheet) => config.sheetRanges[sheet]);
  const movementRangesBySheet = { ...config.movementRanges, ADMINISTRACIÓN: config.adminMovementsRange };
  const movementHeaderRangesBySheet = { ...config.movementHeaderRanges, ADMINISTRACIÓN: config.adminMovementsHeaderRange };
  const memberRangeSet = new Set(memberRanges);
  const movementRangeSet = new Set(Object.values(movementRangesBySheet));
  const ranges = [...memberRanges, ...Object.values(movementHeaderRangesBySheet), ...Object.values(movementRangesBySheet)];
  const response = await client.spreadsheets.values.batchGet({ spreadsheetId: config.sheetId, ranges, majorDimension: "ROWS" });
  const rows: SheetRow[] = [];
  const movementIndexesBySheet: Record<string, ReturnType<typeof resolveMovementColumnIndexes>> = {};
  response.data.valueRanges?.forEach((valueRange, rangeIndex) => {
    const requestedRange = ranges[rangeIndex] ?? valueRange.range ?? "";
    const sheet = (requestedRange.split("!")[0] ?? "").replace(/'/g, "");
    if (Object.values(movementHeaderRangesBySheet).includes(requestedRange)) {
      movementIndexesBySheet[sheet] = resolveMovementColumnIndexes(valueRange.values?.[0]);
    }
  });
  response.data.valueRanges?.forEach((valueRange, rangeIndex) => {
    const requestedRange = ranges[rangeIndex] ?? valueRange.range ?? "";
    const sheet = (requestedRange.split("!")[0] ?? "").replace(/'/g, "");
    const start = Number(requestedRange.match(/![A-Z]+(\d+)/)?.[1] ?? 1);
    const kind: SheetRow["kind"] | null = memberRangeSet.has(requestedRange) ? "members" : movementRangeSet.has(requestedRange) ? "movements" : null;
    if (!kind) return;
    const resolved = movementIndexesBySheet[sheet] ?? resolveMovementColumnIndexes(undefined);
    (valueRange.values ?? []).forEach((row, index) => { if (!isEmpty(row)) rows.push({ kind, sheet, rowNumber: start + index, row, movementIndexes: kind === "movements" ? resolved.indexes : undefined, usedMovementFallback: kind === "movements" ? resolved.usedFallback : undefined }); });
  });
  return rows;
};

const upsertPerson = async (pool: Pool, input: { firstName: string; lastName?: string; dni?: string | null; phone?: string | null; kind: "alumno" | "instructor" | "proveedor" | "cliente" | "otro"; source: string }): Promise<string> => {
  const firstName = normalizeSheetText(input.firstName);
  if (!firstName) throw new Error("Persona sin nombre.");
  const lastName = normalizeSheetText(input.lastName) || " ";
  const dni = normalizeDni(input.dni) || null;
  const normalizedPhone = normalizePhone(input.phone);
  const found = dni
    ? await pool.query<{ id: string }>("select id from miclub.people where dni=$1 limit 1", [dni])
    : await pool.query<{ id: string }>("select id from miclub.people where lower(first_name)=lower($1) and lower(last_name)=lower($2) and coalesce(normalized_phone,'')=$3 limit 1", [firstName, lastName, normalizedPhone]);
  const id = found.rows[0]?.id ?? (await pool.query<{ id: string }>(
    "insert into miclub.people (first_name,last_name,dni,phone,normalized_phone,notes) values ($1,$2,$3,$4,$5,$6) returning id",
    [firstName, lastName, dni, input.phone ?? null, normalizedPhone || null, `Importado desde ${input.source}`]
  )).rows[0]?.id;
  if (!id) throw new Error("No se pudo crear persona.");
  await pool.query("update miclub.people set first_name=$2,last_name=$3,phone=coalesce($4,phone),normalized_phone=coalesce($5,normalized_phone),updated_at=now() where id=$1", [id, firstName, lastName, input.phone ?? null, normalizedPhone || null]);
  await pool.query("insert into miclub.person_kind_links (person_id, kind) values ($1, $2::miclub.person_kind) on conflict do nothing", [id, input.kind]);
  return id;
};

const upsertCategory = async (pool: Pool, name: string): Promise<string | null> => {
  const clean = normalizeSheetText(name) || "Sin categoría";
  const found = await pool.query<{ id: string }>("select id from miclub.movement_categories where lower(name)=lower($1) limit 1", [clean]);
  if (found.rows[0]) return found.rows[0].id;
  return (await pool.query<{ id: string }>("insert into miclub.movement_categories (name) values ($1) returning id", [clean])).rows[0]?.id ?? null;
};

const upsertPaymentMethod = async (pool: Pool, name: string): Promise<string | null> => {
  const clean = normalizeSheetText(name);
  if (!clean) return null;
  return (await pool.query<{ id: string }>("insert into miclub.payment_methods (name) values ($1) on conflict (name) do update set name=excluded.name returning id", [clean])).rows[0]?.id ?? null;
};

const processMember = async (pool: Pool, row: SheetRow, summary: ImportSummary): Promise<string | null> => {
  const firstName = valueAt(row.row, MEMBER_INDEXES.nombre);
  if (!firstName) return null;
  const sectorId = await upsertSector(pool, row.sheet); summary.sectorsProcessed += 1; summary.attemptedWrites += 1;
  const instructorName = valueAt(row.row, MEMBER_INDEXES.instructor) || "Sin instructor";
  const instructorPersonId = await upsertPerson(pool, { firstName: instructorName, kind: "instructor", source: `${row.sheet}:${row.rowNumber}` });
  const instructorId = await upsertInstructor(pool, instructorPersonId, instructorName); summary.instructorsProcessed += 1; summary.attemptedWrites += 1;
  const activityId = await upsertActivity(pool, { sectorId, name: valueAt(row.row, MEMBER_INDEXES.actividad) || "Sin actividad", modality: valueAt(row.row, MEMBER_INDEXES.modalidad) || null, instructorId, monthlyFee: normalizeFee(valueAt(row.row, MEMBER_INDEXES.cuota)) }); summary.activitiesProcessed += 1; summary.attemptedWrites += 1;
  const personId = await upsertPerson(pool, { firstName, lastName: valueAt(row.row, MEMBER_INDEXES.apellido), dni: valueAt(row.row, MEMBER_INDEXES.dni), phone: valueAt(row.row, MEMBER_INDEXES.telefono), kind: "alumno", source: `${row.sheet}:${row.rowNumber}` }); summary.peopleProcessed += 1; summary.attemptedWrites += 1;
  const ext = externalId("google_sheets", "enrollment", normalizeDni(valueAt(row.row, MEMBER_INDEXES.dni)) || personId, row.sheet, activityId);
  const status = normalizeOperationalStatus(valueAt(row.row, MEMBER_INDEXES.estado));
  const dueDate = normalizeDate(valueAt(row.row, MEMBER_INDEXES.vence))?.slice(0, 10) ?? null;
  await pool.query(
    `insert into miclub.enrollments (external_id, person_id, activity_id, fee_amount, status, due_date, source, notes)
     values ($1,$2,$3,$4,$5::miclub.enrollment_status,$6,'google_sheets',$7)
     on conflict (external_id) do update set person_id=excluded.person_id, activity_id=excluded.activity_id, fee_amount=excluded.fee_amount, status=excluded.status, due_date=excluded.due_date, updated_at=now()`,
    [ext, personId, activityId, normalizeFee(valueAt(row.row, MEMBER_INDEXES.cuota)) ?? 0, status === "otro" ? "nuevo_inscripto" : status, dueDate, JSON.stringify({ modality: valueAt(row.row, MEMBER_INDEXES.modalidad) || null })]
  );
  summary.enrollmentsProcessed += 1; summary.attemptedWrites += 1;
  return ext;
};

const processMovement = async (pool: Pool, row: SheetRow, summary: ImportSummary): Promise<void> => {
  if (row.usedMovementFallback) {
    const warning = `Se usaron índices fallback para movimientos en ${row.sheet}; revisar headers del rango.`;
    if (!summary.warnings.includes(warning)) summary.warnings.push(warning);
  }
  const concept = movementValue(row.row, row.movementIndexes ?? {}, "concepto") || movementValue(row.row, row.movementIndexes ?? {}, "categoria");
  const amount = Math.abs(normalizeMoney(movementValue(row.row, row.movementIndexes ?? {}, "monto")));
  if (!concept || amount === 0) return;
  const typeText = normalizeComparableText(movementValue(row.row, row.movementIndexes ?? {}, "tipo"));
  const movementType = typeText.startsWith("egreso") ? "EGRESOS" : typeText.startsWith("capital") ? "CAPITAL" : "INGRESOS";
  const rawMovementDate = movementValue(row.row, row.movementIndexes ?? {}, "fecha");
  const movementDate = normalizeDate(rawMovementDate);
  // Decisión: la fecha del movimiento es obligatoria porque miclub.movements.movement_date
  // no permite nulos y usar la fecha actual distorsiona los reportes financieros históricos.
  // El importador registra esta fila como error no bloqueante en el batch y continúa.
  if (!movementDate) throw new Error(`Movimiento sin fecha válida en hoja ${row.sheet}, fila ${row.rowNumber}. Valor recibido: ${rawMovementDate || "vacío"}.`);
  const sectorId = await upsertSector(pool, movementValue(row.row, row.movementIndexes ?? {}, "sector") || row.sheet); summary.sectorsProcessed += 1; summary.attemptedWrites += 1;
  const categoryId = await upsertCategory(pool, movementValue(row.row, row.movementIndexes ?? {}, "categoria")); summary.movementCategoriesProcessed += 1; summary.attemptedWrites += 1;
  const paymentMethodId = await upsertPaymentMethod(pool, movementValue(row.row, row.movementIndexes ?? {}, "medioPago"));
  if (paymentMethodId) summary.attemptedWrites += 1;
  const ext = movementValue(row.row, row.movementIndexes ?? {}, "id") || externalId("google_sheets", row.sheet, row.rowNumber, movementDate.slice(0, 10), movementType, amount);
  await pool.query(
    `insert into miclub.movements (external_id,movement_date,movement_type,category_id,sector_id,concept,counterparty_text,amount,taxes,payment_method_id,financial_status,operational_status,source,source_payload)
     values ($1,$2,$3::miclub.movement_type,$4,$5,$6,$7,$8,$9,$10,$11::miclub.financial_status,$12::miclub.movement_status,'google_sheets',$13::jsonb)
     on conflict (external_id) do update set movement_date=excluded.movement_date, movement_type=excluded.movement_type, category_id=excluded.category_id, sector_id=excluded.sector_id, concept=excluded.concept, counterparty_text=excluded.counterparty_text, amount=excluded.amount, taxes=excluded.taxes, payment_method_id=excluded.payment_method_id, financial_status=excluded.financial_status, operational_status=excluded.operational_status, source_payload=excluded.source_payload, updated_at=now()`,
    [externalId("google_sheets", "movement", ext), movementDate, movementType, categoryId, sectorId, concept, movementValue(row.row, row.movementIndexes ?? {}, "contraparte") || null, amount, Math.abs(normalizeMoney(movementValue(row.row, row.movementIndexes ?? {}, "impuestos"))), paymentMethodId, normalizeFinancialStatus(movementValue(row.row, row.movementIndexes ?? {}, "estado")), normalizeComparableText(movementValue(row.row, row.movementIndexes ?? {}, "estado")).includes("pend") ? "PENDIENTE" : "COMPLETADO", JSON.stringify({ sheet: row.sheet, rowNumber: row.rowNumber, row: row.row })]
  );
  summary.movementsProcessed += 1; summary.attemptedWrites += 1;
};

const hasEnrollmentInactiveColumn = async (pool: Pool): Promise<boolean> => {
  const result = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'miclub' and table_name = 'enrollments' and column_name = 'inactive'
     )`,
  );
  return result.rows[0]?.exists === true;
};

const reconcileMissingEnrollments = async (pool: Pool, processedExternalIds: Set<string>, summary: ImportSummary): Promise<void> => {
  if (summary.dryRun) return;
  const result = await pool.query<{ external_id: string }>(
    `select external_id
     from miclub.enrollments
     where source = 'google_sheets'
       and external_id <> all($1::text[])`,
    [[...processedExternalIds]],
  );
  const missingExternalIds = result.rows.map((row) => row.external_id);
  summary.missingEnrollments = missingExternalIds.length;
  if (missingExternalIds.length === 0) return;

  const warning = `${missingExternalIds.length} inscripciones google_sheets no aparecieron en el último import.`;
  summary.warnings.push(warning);
  if (summary.missingEnrollmentsAction === "noop" || summary.missingEnrollmentsAction === "warn") return;

  if (summary.missingEnrollmentsAction === "abandon") {
    await pool.query(
      `update miclub.enrollments
       set status = 'abandonado'::miclub.enrollment_status, updated_at = now()
       where source = 'google_sheets'
         and external_id = any($1::text[])`,
      [missingExternalIds],
    );
    summary.attemptedWrites += 1;
    summary.persistedWrites += 1;
    return;
  }

  if (summary.missingEnrollmentsAction === "inactive") {
    if (await hasEnrollmentInactiveColumn(pool)) {
      await pool.query(
        `update miclub.enrollments
         set inactive = true, updated_at = now()
         where source = 'google_sheets'
           and external_id = any($1::text[])`,
        [missingExternalIds],
      );
      summary.attemptedWrites += 1;
      summary.persistedWrites += 1;
    } else {
      summary.warnings.push("GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY=inactive no aplicó cambios porque miclub.enrollments.inactive no existe.");
    }
  }
};

export const importGoogleSheets = async (options: ImportOptions = {}): Promise<ImportSummary> => {
  const dryRun = options.dryRun ?? true;
  const batchSize = options.batchSize ?? 50;
  const pool = await getPostgresPool();
  const strategy = options.missingEnrollmentStrategy ?? parseMissingEnrollmentStrategy();
  const batchId = await createImportBatch(pool, { source: "google_sheets", dryRun, notes: dryRun ? "Dry run: solo valida y revierte entidades." : undefined });
  const summary: ImportSummary = {
    batchId,
    dryRun,
    read: 0,
    attemptedWrites: 0,
    persistedWrites: 0,
    rolledBackWrites: 0,
    sectorsProcessed: 0,
    movementCategoriesProcessed: 0,
    peopleProcessed: 0,
    instructorsProcessed: 0,
    activitiesProcessed: 0,
    enrollmentsProcessed: 0,
    movementsProcessed: 0,
    missingEnrollments: 0,
    missingEnrollmentsAction: strategy,
    errors: 0,
    warnings: [],
  };
  const processedEnrollmentExternalIds = new Set<string>();
  try {
    const rows = await readRows(); summary.read = rows.length;
    for (const group of chunk(rows, batchSize)) {
      const groupErrors: Array<{ row: SheetRow; error: unknown }> = [];
      const groupAttemptedWritesStart = summary.attemptedWrites;
      await pool.query("begin");
      try {
        for (const row of group) {
          try {
            if (row.kind === "members") {
              const enrollmentExternalId = await processMember(pool, row, summary);
              if (enrollmentExternalId) processedEnrollmentExternalIds.add(enrollmentExternalId);
            } else await processMovement(pool, row, summary);
          }
          catch (error) { summary.errors += 1; groupErrors.push({ row, error }); }
        }
        if (dryRun) {
          await pool.query("rollback");
          summary.rolledBackWrites += summary.attemptedWrites - groupAttemptedWritesStart;
        } else {
          await pool.query("commit");
          summary.persistedWrites += summary.attemptedWrites - groupAttemptedWritesStart;
        }
      } catch (error) {
        await pool.query("rollback");
        summary.rolledBackWrites += summary.attemptedWrites - groupAttemptedWritesStart;
        throw error;
      }
      for (const { row, error } of groupErrors) await logImportError(pool, { batchId, sourceTable: row.kind, sourceRow: `${row.sheet}:${row.rowNumber}`, error, rawPayload: row.row });
    }
    await reconcileMissingEnrollments(pool, processedEnrollmentExternalIds, summary);
    await finishImportBatch(pool, batchId, dryRun ? "dry_run" : summary.errors > 0 ? "completed_with_errors" : "completed", JSON.stringify(summary));
    return summary;
  } catch (error) {
    await finishImportBatch(pool, batchId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
};
