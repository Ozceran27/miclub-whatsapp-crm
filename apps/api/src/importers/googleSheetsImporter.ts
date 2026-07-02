import { google } from "googleapis";
import { getPostgresPool } from "../db/postgres.js";
import {
  adminMovementFallbackIndexes,
  getGoogleSheetsConfig,
  memberValue,
  movementValue,
  resolveMemberColumnIndexes,
  resolveMovementColumnIndexes,
  sectorMovementFallbackIndexes,
  MOVEMENT_SHEET_NAMES,
  SHEET_NAMES,
  type MemberColumnIndexes,
  parseAulaCommissionAverage,
  parseCurrentMonthUtility,
  type MovementColumnIndexes,
  type MovementFallbackMode,
} from "../services/googleSheets.js";
import {
  upsertActivity,
  upsertInstructor,
  upsertSector,
} from "../repositories/activitiesRepository.js";
import {
  createImportBatch,
  finishImportBatch,
  logImportError,
} from "./importLogger.js";
import {
  normalizeComparableText,
  formatArgentinaTimestampForPostgres,
  formatDateOnlyForPostgres,
  normalizeDni,
  normalizeFee,
  normalizeFinancialStatus,
  normalizeMoney,
  normalizeOperationalStatus,
  normalizePhone,
  normalizeSheetText,
} from "./normalizers.js";

type Pool = Awaited<ReturnType<typeof getPostgresPool>>;
export type MissingEnrollmentStrategy =
  | "noop"
  | "abandon"
  | "inactive"
  | "archive"
  | "warn";
type ImportOptions = {
  dryRun?: boolean;
  batchSize?: number;
  missingEnrollmentStrategy?: MissingEnrollmentStrategy;
};
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
  operationalBalancesProcessed: number;
  sheetMetricSnapshotsProcessed: number;
  missingEnrollments: number;
  missingEnrollmentsAction: MissingEnrollmentStrategy;
  errors: number;
  warnings: string[];
  movementFallbacks: { safeColumn: number; fullLayout: number };
};
type SheetRow = {
  kind: "members" | "movements";
  sheet: string;
  rowNumber: number;
  row: unknown[];
  memberIndexes?: MemberColumnIndexes;
  usedMemberFallback?: boolean;
  movementIndexes?: MovementColumnIndexes;
  usedMovementFallback?: boolean;
  movementFallbackKeys?: string[];
  movementHeadersFound?: boolean;
  movementFallbackMode?: MovementFallbackMode;
};
const isEmpty = (row: unknown[]): boolean =>
  row.every((cell) => String(cell ?? "").trim() === "");
const stablePart = (value: unknown): string =>
  normalizeComparableText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sin-datos";
const externalId = (...parts: unknown[]): string =>
  parts.map(stablePart).join(":");
const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const getSheetsClient = (config: ReturnType<typeof getGoogleSheetsConfig>) => {
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
};

const importEnabled = (): boolean =>
  ["true", "1", "yes", "on"].includes(
    (process.env.GOOGLE_SHEETS_IMPORT_ENABLED ?? "true").toLowerCase(),
  );

export const parseMissingEnrollmentStrategy = (
  value = process.env.GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY,
): MissingEnrollmentStrategy => {
  const normalized = normalizeComparableText(value ?? "warn").replace(
    /-/g,
    "_",
  );
  if (
    ["noop", "none", "ignore", "nothing", "no_hacer_nada"].includes(normalized)
  )
    return "noop";
  if (
    [
      "abandon",
      "abandoned",
      "abandonado",
      "mark_abandoned",
      "marcar_abandonado",
    ].includes(normalized)
  )
    return "abandon";
  if (
    [
      "inactive",
      "archive",
      "archivar",
      "archived",
      "supersede",
      "superseded",
      "supersede_missing",
      "replace",
      "replaced",
      "obsolete",
      "obsoleto",
      "inactivo",
      "mark_inactive",
      "marcar_inactive",
      "marcar_inactivo",
    ].includes(normalized)
  )
    return normalized.includes("archive") || normalized.includes("archiv") || normalized.includes("supers") || normalized.includes("replace") || normalized.includes("obsolete") || normalized.includes("obsoleto")
      ? "archive"
      : "inactive";
  if (["warn", "warning", "advertir", "advertencia"].includes(normalized))
    return "warn";
  return "warn";
};

const readRows = async (): Promise<{
  rows: SheetRow[];
  adminBalanceRows: unknown[][];
  metricRanges: Record<string, unknown[][]>;
}> => {
  const config = getGoogleSheetsConfig();
  if (!importEnabled())
    throw new Error(
      "GOOGLE_SHEETS_IMPORT_ENABLED deshabilita la importación desde Google Sheets.",
    );
  if (!config.credentialsPresent)
    throw new Error(
      "Faltan credenciales de Google Sheets (GOOGLE_SHEET_ID/GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).",
    );
  const client = getSheetsClient(config);
  const memberRanges = SHEET_NAMES.map((sheet) => config.sheetRanges[sheet]);
  const memberHeaderRangesBySheet = Object.fromEntries(
    SHEET_NAMES.map((sheet) => [sheet, config.memberHeaderRanges[sheet]]),
  );
  const movementRangesBySheet = {
    ...Object.fromEntries(
      MOVEMENT_SHEET_NAMES.map((sheet) => [
        sheet,
        config.movementRanges[sheet],
      ]),
    ),
    ADMINISTRACIÓN: config.adminMovementsRange,
  };
  const movementHeaderRangesBySheet = {
    ...Object.fromEntries(
      MOVEMENT_SHEET_NAMES.map((sheet) => [
        sheet,
        config.movementHeaderRanges[sheet],
      ]),
    ),
    ADMINISTRACIÓN: config.adminMovementsHeaderRange,
  };
  const memberRangeSet = new Set(memberRanges);
  const movementRangeSet = new Set(Object.values(movementRangesBySheet));
  const metricRangeNames = [
    "FITNESS!AN3",
    "FITNESS!AR9:AY14",
    "FITNESS!X3",
    "SALON!AW29",
    "SALON!AN24:AU29",
    "AULA!AW29",
    "AULA!AN24:AU29",
    "AULA!B18:V30",
    "SALON!X3",
    "AULA!X3",
    "'LOCAL 1'!AN3",
    "'LOCAL 1'!AB19:AI24",
    "'LOCAL 1'!X3",
    "CANTINA!B13:AB3000",
  ];
  const ranges = [
    ...Object.values(memberHeaderRangesBySheet),
    ...memberRanges,
    ...Object.values(movementHeaderRangesBySheet),
    ...Object.values(movementRangesBySheet),
    config.adminBalancesRange,
    ...metricRangeNames,
  ];
  const response = await client.spreadsheets.values.batchGet({
    spreadsheetId: config.sheetId,
    ranges,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows: SheetRow[] = [];
  const memberIndexesBySheet: Record<
    string,
    ReturnType<typeof resolveMemberColumnIndexes>
  > = {};
  const movementIndexesBySheet: Record<
    string,
    ReturnType<typeof resolveMovementColumnIndexes>
  > = {};
  response.data.valueRanges?.forEach((valueRange, rangeIndex) => {
    const requestedRange = ranges[rangeIndex] ?? valueRange.range ?? "";
    const sheet = (requestedRange.split("!")[0] ?? "").replace(/'/g, "");
    if (Object.values(memberHeaderRangesBySheet).includes(requestedRange)) {
      memberIndexesBySheet[sheet] = resolveMemberColumnIndexes(
        valueRange.values?.[0],
      );
    }
    if (Object.values(movementHeaderRangesBySheet).includes(requestedRange)) {
      const headerRow = valueRange.values?.[0];
      if (headerRow?.some((cell) => String(cell ?? "").trim() !== "")) {
        const fallbackIndexes =
          normalizeComparableText(sheet) === "administracion"
            ? adminMovementFallbackIndexes
            : sectorMovementFallbackIndexes;
        movementIndexesBySheet[sheet] = resolveMovementColumnIndexes(
          headerRow,
          fallbackIndexes,
        );
      }
    }
  });
  response.data.valueRanges?.forEach((valueRange, rangeIndex) => {
    const requestedRange = ranges[rangeIndex] ?? valueRange.range ?? "";
    const sheet = (requestedRange.split("!")[0] ?? "").replace(/'/g, "");
    const start = Number(requestedRange.match(/![A-Z]+(\d+)/)?.[1] ?? 1);
    const kind: SheetRow["kind"] | null = memberRangeSet.has(requestedRange)
      ? "members"
      : movementRangeSet.has(requestedRange)
        ? "movements"
        : null;
    if (!kind) return;
    const fallbackIndexes =
      normalizeComparableText(sheet) === "administracion"
        ? adminMovementFallbackIndexes
        : sectorMovementFallbackIndexes;
    const movementHeadersFound = movementIndexesBySheet[sheet] !== undefined;
    const resolvedMovement =
      movementIndexesBySheet[sheet] ??
      resolveMovementColumnIndexes(undefined, fallbackIndexes);
    const resolvedMember =
      memberIndexesBySheet[sheet] ?? resolveMemberColumnIndexes(undefined);
    (valueRange.values ?? []).forEach((row, index) => {
      if (!isEmpty(row))
        rows.push({
          kind,
          sheet,
          rowNumber: start + index,
          row,
          memberIndexes:
            kind === "members" ? resolvedMember.indexes : undefined,
          usedMemberFallback:
            kind === "members" ? resolvedMember.usedFallback : undefined,
          movementIndexes:
            kind === "movements" ? resolvedMovement.indexes : undefined,
          usedMovementFallback:
            kind === "movements" ? resolvedMovement.usedFallback : undefined,
          movementFallbackKeys:
            kind === "movements" ? resolvedMovement.fallbackKeys : undefined,
          movementHeadersFound:
            kind === "movements" ? movementHeadersFound : undefined,
          movementFallbackMode:
            kind === "movements" ? resolvedMovement.fallbackMode : undefined,
        });
    });
  });
  const adminBalanceIndex = ranges.indexOf(config.adminBalancesRange);
  const adminBalanceRows =
    response.data.valueRanges?.[adminBalanceIndex]?.values ?? [];
  const metricRanges = Object.fromEntries(
    metricRangeNames.map((range) => [
      range,
      response.data.valueRanges?.[ranges.indexOf(range)]?.values ?? [],
    ]),
  );
  return { rows, adminBalanceRows, metricRanges };
};

const upsertPerson = async (
  pool: Pool,
  input: {
    firstName: string;
    lastName?: string;
    dni?: string | null;
    phone?: string | null;
    kind: "alumno" | "instructor" | "proveedor" | "cliente" | "otro";
    source: string;
  },
): Promise<string> => {
  const firstName = normalizeSheetText(input.firstName);
  if (!firstName) throw new Error("Persona sin nombre.");
  const lastName = normalizeSheetText(input.lastName) || " ";
  const dni = normalizeDni(input.dni) || null;
  const normalizedPhone = normalizePhone(input.phone);
  const found = dni
    ? await pool.query<{ id: string }>(
        "select id from miclub.people where dni=$1 limit 1",
        [dni],
      )
    : await pool.query<{ id: string }>(
        "select id from miclub.people where lower(first_name)=lower($1) and lower(last_name)=lower($2) and coalesce(normalized_phone,'')=$3 limit 1",
        [firstName, lastName, normalizedPhone],
      );
  const id =
    found.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        "insert into miclub.people (first_name,last_name,dni,phone,normalized_phone,notes) values ($1,$2,$3,$4,$5,$6) returning id",
        [
          firstName,
          lastName,
          dni,
          input.phone ?? null,
          normalizedPhone || null,
          `Importado desde ${input.source}`,
        ],
      )
    ).rows[0]?.id;
  if (!id) throw new Error("No se pudo crear persona.");
  await pool.query(
    "update miclub.people set first_name=$2,last_name=$3,phone=coalesce($4,phone),normalized_phone=coalesce($5,normalized_phone),updated_at=now() where id=$1",
    [id, firstName, lastName, input.phone ?? null, normalizedPhone || null],
  );
  await pool.query(
    "insert into miclub.person_kind_links (person_id, kind) values ($1, $2::miclub.person_kind) on conflict do nothing",
    [id, input.kind],
  );
  return id;
};

const upsertCategory = async (
  pool: Pool,
  name: string,
): Promise<string | null> => {
  const clean = normalizeSheetText(name) || "Sin categoría";
  const found = await pool.query<{ id: string }>(
    "select id from miclub.movement_categories where lower(name)=lower($1) limit 1",
    [clean],
  );
  if (found.rows[0]) return found.rows[0].id;
  return (
    (
      await pool.query<{ id: string }>(
        "insert into miclub.movement_categories (name) values ($1) returning id",
        [clean],
      )
    ).rows[0]?.id ?? null
  );
};

const upsertPaymentMethod = async (
  pool: Pool,
  name: string,
): Promise<string | null> => {
  const clean = normalizeSheetText(name);
  if (!clean) return null;
  return (
    (
      await pool.query<{ id: string }>(
        "insert into miclub.payment_methods (name) values ($1) on conflict (name) do update set name=excluded.name returning id",
        [clean],
      )
    ).rows[0]?.id ?? null
  );
};

export const processMember = async (
  pool: Pool,
  row: SheetRow,
  summary: ImportSummary,
): Promise<string | null> => {
  if (row.usedMemberFallback) {
    const warning = `Se usaron índices fallback para inscriptos en ${row.sheet}; revisar headers del rango.`;
    if (!summary.warnings.includes(warning)) summary.warnings.push(warning);
  }
  const memberIndexes = row.memberIndexes ?? {};
  const firstName = memberValue(row.row, memberIndexes, "nombre");
  if (!firstName) return null;
  const sectorId = await upsertSector(pool, row.sheet);
  summary.sectorsProcessed += 1;
  summary.attemptedWrites += 1;
  const instructorName =
    memberValue(row.row, memberIndexes, "instructor") || "Sin instructor";
  const instructorPersonId = await upsertPerson(pool, {
    firstName: instructorName,
    kind: "instructor",
    source: `${row.sheet}:${row.rowNumber}`,
  });
  const instructorId = await upsertInstructor(
    pool,
    instructorPersonId,
    instructorName,
  );
  summary.instructorsProcessed += 1;
  summary.attemptedWrites += 1;
  const activityId = await upsertActivity(pool, {
    sectorId,
    name: memberValue(row.row, memberIndexes, "actividad") || "Sin actividad",
    modality: memberValue(row.row, memberIndexes, "modalidad") || null,
    instructorId,
    monthlyFee: normalizeFee(memberValue(row.row, memberIndexes, "cuota")),
  });
  summary.activitiesProcessed += 1;
  summary.attemptedWrites += 1;
  const personId = await upsertPerson(pool, {
    firstName,
    lastName: memberValue(row.row, memberIndexes, "apellido"),
    dni: memberValue(row.row, memberIndexes, "dni"),
    phone: memberValue(row.row, memberIndexes, "tel"),
    kind: "alumno",
    source: `${row.sheet}:${row.rowNumber}`,
  });
  summary.peopleProcessed += 1;
  summary.attemptedWrites += 1;
  const ext = externalId(
    "google_sheets",
    "enrollment",
    normalizeDni(memberValue(row.row, memberIndexes, "dni")) || personId,
    row.sheet,
    activityId,
  );
  const status = normalizeOperationalStatus(
    memberValue(row.row, memberIndexes, "estado"),
  );
  const dueDate = formatDateOnlyForPostgres(
    memberValue(row.row, memberIndexes, "vence"),
  );
  const archiveColumns = await getEnrollmentArchiveColumns(pool);
  const reactivateSetClauses = archiveColumns.has("inactive")
    ? [
        "inactive=false",
        archiveColumns.has("inactive_reason") ? "inactive_reason=null" : undefined,
        archiveColumns.has("inactive_at") ? "inactive_at=null" : undefined,
        archiveColumns.has("superseded_at") ? "superseded_at=null" : undefined,
        archiveColumns.has("superseded_reason") ? "superseded_reason=null" : undefined,
      ].filter((clause): clause is string => Boolean(clause))
    : [];
  const reactivateOnConflict = reactivateSetClauses.length > 0
    ? `, ${reactivateSetClauses.join(", ")}`
    : "";
  await pool.query(
    `insert into miclub.enrollments (external_id, person_id, activity_id, fee_amount, status, due_date, source, notes)
     values ($1,$2,$3,$4,$5::miclub.enrollment_status,$6,'google_sheets',$7)
     on conflict (external_id) do update set person_id=excluded.person_id, activity_id=excluded.activity_id, fee_amount=excluded.fee_amount, status=excluded.status, due_date=excluded.due_date, updated_at=now()${reactivateOnConflict}`,
    [
      ext,
      personId,
      activityId,
      normalizeFee(memberValue(row.row, memberIndexes, "cuota")) ?? 0,
      status === "otro" ? "nuevo_inscripto" : status,
      dueDate,
      JSON.stringify({
        modality: memberValue(row.row, memberIndexes, "modalidad") || null,
      }),
    ],
  );
  summary.enrollmentsProcessed += 1;
  summary.attemptedWrites += 1;
  return ext;
};

export const processMovement = async (
  pool: Pool,
  row: SheetRow,
  summary: ImportSummary,
): Promise<void> => {
  if (row.usedMovementFallback) {
    const fallbackKeys = row.movementFallbackKeys ?? [];
    const warning =
      row.movementHeadersFound === false
        ? `No se encontraron headers de movimientos en ${row.sheet}; se usó fallback completo`
        : `Se usaron índices fallback seguros para movimientos en ${row.sheet}: ${fallbackKeys.join(", ") || "columnas sin header"}`;
    if (row.movementFallbackMode === "layout" || row.movementHeadersFound === false) summary.movementFallbacks.fullLayout += 1;
    else summary.movementFallbacks.safeColumn += 1;
    if (!summary.warnings.includes(warning)) summary.warnings.push(warning);
  }
  const movementIndexes = row.movementIndexes ?? {};
  const rawConcept = movementValue(row.row, movementIndexes, "concepto");
  const rawCategory = movementValue(row.row, movementIndexes, "categoria");
  const rawId = movementValue(row.row, movementIndexes, "id");
  const rawMovementDate = movementValue(row.row, movementIndexes, "fecha");
  const rawCounterparty = movementValue(
    row.row,
    movementIndexes,
    "contraparte",
  );
  const hasOperationalData = [
    rawConcept,
    rawCategory,
    rawId,
    rawMovementDate,
    rawCounterparty,
  ].some((value) => normalizeSheetText(value) !== "");
  if (!hasOperationalData) return;
  const concept = rawConcept || rawCategory || "Sin concepto";
  const amount = Math.abs(
    normalizeMoney(movementValue(row.row, movementIndexes, "monto")),
  );
  const typeText = normalizeComparableText(
    movementValue(row.row, movementIndexes, "tipo"),
  );
  const movementType = typeText.startsWith("egreso")
    ? "EGRESOS"
    : typeText.startsWith("capital")
      ? "CAPITAL"
      : "INGRESOS";
  const movementDate = formatArgentinaTimestampForPostgres(rawMovementDate);
  // Decisión: la fecha del movimiento es obligatoria porque miclub.movements.movement_date
  // no permite nulos y usar la fecha actual distorsiona los reportes financieros históricos.
  // El importador registra esta fila como error no bloqueante en el batch y continúa.
  if (!movementDate)
    throw new Error(
      `Movimiento sin fecha válida en hoja ${row.sheet}, fila ${row.rowNumber}. Valor recibido: ${rawMovementDate || "vacío"}.`,
    );
  const sectorId = await upsertSector(
    pool,
    movementValue(row.row, movementIndexes, "sector") || row.sheet,
  );
  summary.sectorsProcessed += 1;
  summary.attemptedWrites += 1;
  const categoryId = await upsertCategory(
    pool,
    movementValue(row.row, movementIndexes, "categoria"),
  );
  summary.movementCategoriesProcessed += 1;
  summary.attemptedWrites += 1;
  const paymentMethodId = await upsertPaymentMethod(
    pool,
    movementValue(row.row, movementIndexes, "medioPago"),
  );
  if (paymentMethodId) summary.attemptedWrites += 1;
  const ext =
    movementValue(row.row, movementIndexes, "id") ||
    externalId(
      "google_sheets",
      row.sheet,
      row.rowNumber,
      movementDate.slice(0, 10),
      movementType,
      amount,
    );
  await pool.query(
    `insert into miclub.movements (external_id,movement_date,movement_type,category_id,sector_id,concept,counterparty_text,amount,taxes,payment_method_id,financial_status,operational_status,source,source_payload)
     values ($1,$2,$3::miclub.movement_type,$4,$5,$6,$7,$8,$9,$10,$11::miclub.financial_status,$12::miclub.movement_status,'google_sheets',$13::jsonb)
     on conflict (external_id) do update set movement_date=excluded.movement_date, movement_type=excluded.movement_type, category_id=excluded.category_id, sector_id=excluded.sector_id, concept=excluded.concept, counterparty_text=excluded.counterparty_text, amount=excluded.amount, taxes=excluded.taxes, payment_method_id=excluded.payment_method_id, financial_status=excluded.financial_status, operational_status=excluded.operational_status, source_payload=excluded.source_payload, updated_at=now()`,
    [
      externalId("google_sheets", "movement", ext),
      movementDate,
      movementType,
      categoryId,
      sectorId,
      concept,
      movementValue(row.row, movementIndexes, "contraparte") || null,
      amount,
      Math.abs(
        normalizeMoney(movementValue(row.row, movementIndexes, "impuestos")),
      ),
      paymentMethodId,
      normalizeFinancialStatus(
        movementValue(row.row, movementIndexes, "estadoFinan"),
      ),
      normalizeComparableText(
        movementValue(row.row, movementIndexes, "estado"),
      ).includes("pend")
        ? "PENDIENTE"
        : "COMPLETADO",
      JSON.stringify({
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        row: row.row,
      }),
    ],
  );
  summary.movementsProcessed += 1;
  summary.attemptedWrites += 1;
};

const parseOperationalBalances = (balanceRows: unknown[][]) => ({
  liquidity: normalizeMoney(balanceRows[0]?.[0]),
  cash: normalizeMoney(balanceRows[0]?.[3]),
  bank: normalizeMoney(balanceRows[1]?.[3]),
  dollars: normalizeMoney(balanceRows[2]?.[3]),
});

const upsertOperationalBalances = async (
  pool: Pool,
  balanceRows: unknown[][],
  summary: ImportSummary,
): Promise<void> => {
  const balances = parseOperationalBalances(balanceRows);
  const hasBalanceData = [
    balances.liquidity,
    balances.cash,
    balances.bank,
    balances.dollars,
  ].some((value) => value !== 0);
  if (!hasBalanceData) {
    summary.warnings.push(
      "No se detectaron saldos operativos en ADMINISTRACIÓN!AD12:AG14.",
    );
    return;
  }
  await pool.query(
    `insert into miclub.operational_balances (cutoff_date, liquidity, cash, bank, dollars, source, source_payload)
     values (current_date, $1, $2, $3, $4, 'google_sheets', $5::jsonb)
     on conflict (source, cutoff_date) do update set liquidity=excluded.liquidity, cash=excluded.cash, bank=excluded.bank, dollars=excluded.dollars, source_payload=excluded.source_payload, updated_at=now()`,
    [
      balances.liquidity,
      balances.cash,
      balances.bank,
      balances.dollars,
      JSON.stringify({ range: "ADMINISTRACIÓN!AD12:AG14", rows: balanceRows }),
    ],
  );
  summary.operationalBalancesProcessed += 1;
  summary.attemptedWrites += 1;
};

const getSingleMetricValue = (rows: unknown[][]): number | null => {
  const raw = rows[0]?.[0];
  if (raw == null || String(raw).trim() === "") return null;
  return normalizeMoney(raw);
};

const sumCantinaMetric = (rows: unknown[][], type: "INGRESOS" | "EGRESOS", category: "KIOSCO" | "BEBIDAS"): number => {
  const indexes = sectorMovementFallbackIndexes;
  return rows.reduce((sum, row) => {
    const rowType = normalizeComparableText(movementValue(row, indexes, "tipo"));
    const rowCategory = normalizeComparableText(movementValue(row, indexes, "categoria"));
    const rowStatus = normalizeComparableText(movementValue(row, indexes, "estado"));
    const matchesType = type === "INGRESOS" ? rowType.startsWith("ingreso") : rowType.startsWith("egreso");
    const matchesCategory = rowCategory === normalizeComparableText(category);
    return matchesType && matchesCategory && rowStatus.includes("completado")
      ? sum + Math.abs(normalizeMoney(movementValue(row, indexes, "monto")))
      : sum;
  }, 0);
};

const buildSheetMetricSnapshots = (metricRanges: Record<string, unknown[][]>) => {
  const cantinaRows = metricRanges["CANTINA!B13:AB3000"] ?? [];
  const cantinaKioskIncome = sumCantinaMetric(cantinaRows, "INGRESOS", "KIOSCO");
  const cantinaDrinksIncome = sumCantinaMetric(cantinaRows, "INGRESOS", "BEBIDAS");
  const cantinaCmv = sumCantinaMetric(cantinaRows, "EGRESOS", "BEBIDAS");
  // Snapshots conservan métricas que en la planilla viven fuera del detalle normalizado.
  // CANTINA replica la regla contable: KIOSCO + BEBIDAS - CMV, donde CMV son EGRESOS BEBIDAS completados.
  return [
    { metricKey: "fitness.total_profitability", metricValue: getSingleMetricValue(metricRanges["FITNESS!AN3"] ?? []), sourceRange: "FITNESS!AN3" },
    { metricKey: "fitness.current_month_profitability", metricValue: parseCurrentMonthUtility(metricRanges["FITNESS!AR9:AY14"] ?? []).value, sourceRange: "FITNESS!AR9:AY14" },
    { metricKey: "fitness.settlement_balance", metricValue: getSingleMetricValue(metricRanges["FITNESS!X3"] ?? []), sourceRange: "FITNESS!X3" },
    { metricKey: "salon.total_profitability", metricValue: getSingleMetricValue(metricRanges["SALON!AW29"] ?? []), sourceRange: "SALON!AW29" },
    { metricKey: "salon.current_month_profitability", metricValue: parseCurrentMonthUtility(metricRanges["SALON!AN24:AU29"] ?? []).value, sourceRange: "SALON!AN24:AU29" },
    { metricKey: "aula.total_profitability", metricValue: getSingleMetricValue(metricRanges["AULA!AW29"] ?? []), sourceRange: "AULA!AW29" },
    { metricKey: "aula.current_month_profitability", metricValue: parseCurrentMonthUtility(metricRanges["AULA!AN24:AU29"] ?? []).value, sourceRange: "AULA!AN24:AU29" },
    { metricKey: "aula.average_commission", metricValue: parseAulaCommissionAverage(metricRanges["AULA!B18:V30"] ?? []), sourceRange: "AULA!B18:V30" },
    { metricKey: "salon.settlement_balance", metricValue: getSingleMetricValue(metricRanges["SALON!X3"] ?? []), sourceRange: "SALON!X3" },
    { metricKey: "aula.settlement_balance", metricValue: getSingleMetricValue(metricRanges["AULA!X3"] ?? []), sourceRange: "AULA!X3" },
    { metricKey: "local1.total_profitability", metricValue: getSingleMetricValue(metricRanges["'LOCAL 1'!AN3"] ?? []), sourceRange: "'LOCAL 1'!AN3" },
    { metricKey: "local1.current_month_profitability", metricValue: parseCurrentMonthUtility(metricRanges["'LOCAL 1'!AB19:AI24"] ?? []).value, sourceRange: "'LOCAL 1'!AB19:AI24" },
    { metricKey: "local1.settlement_balance", metricValue: getSingleMetricValue(metricRanges["'LOCAL 1'!X3"] ?? []), sourceRange: "'LOCAL 1'!X3" },
    { metricKey: "cantina.kiosk_income", metricValue: cantinaKioskIncome, sourceRange: "CANTINA!B13:AB3000" },
    { metricKey: "cantina.drinks_income", metricValue: cantinaDrinksIncome, sourceRange: "CANTINA!B13:AB3000" },
    { metricKey: "cantina.cmv", metricValue: cantinaCmv, sourceRange: "CANTINA!B13:AB3000" },
    { metricKey: "cantina.total_profitability", metricValue: cantinaKioskIncome + cantinaDrinksIncome - cantinaCmv, sourceRange: "CANTINA!B13:AB3000" },
  ];
};

const upsertSheetMetricSnapshots = async (
  pool: Pool,
  metricRanges: Record<string, unknown[][]>,
  summary: ImportSummary,
): Promise<void> => {
  for (const metric of buildSheetMetricSnapshots(metricRanges)) {
    if (metric.metricValue == null) {
      summary.warnings.push(`No se detectó dato importable para ${metric.metricKey} (${metric.sourceRange}).`);
      continue;
    }
    await pool.query(
      `insert into miclub.sheet_metric_snapshots (metric_key, metric_value, source, source_range, source_payload)
       values ($1, $2, 'google_sheets', $3, $4::jsonb)`,
      [metric.metricKey, metric.metricValue, metric.sourceRange, JSON.stringify({ range: metric.sourceRange, rows: metricRanges[metric.sourceRange] ?? [] })],
    );
    summary.sheetMetricSnapshotsProcessed += 1;
    summary.attemptedWrites += 1;
  }
};

const getEnrollmentArchiveColumns = async (pool: Pool): Promise<Set<string>> => {
  const result = await pool.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
       where table_schema = 'miclub'
         and table_name = 'enrollments'
         and column_name = any($1::text[])`,
    [["inactive", "inactive_reason", "inactive_at", "superseded_at", "superseded_reason"]],
  );
  return new Set(result.rows.map((row) => row.column_name));
};


const reconcileMissingEnrollments = async (
  pool: Pool,
  processedExternalIds: Set<string>,
  summary: ImportSummary,
): Promise<void> => {
  if (summary.dryRun) return;
  const result = await pool.query<{
    external_id: string;
    dni: string | null;
    first_name: string | null;
    last_name: string | null;
    activity: string | null;
    sector: string | null;
    status: string | null;
  }>(
    `select e.external_id, p.dni, p.first_name, p.last_name, a.name as activity, s.name as sector, e.status::text as status
     from miclub.enrollments e
     left join miclub.people p on p.id = e.person_id
     left join miclub.activities a on a.id = e.activity_id
     left join miclub.sectors s on s.id = a.sector_id
     where e.source = 'google_sheets'
       and e.external_id <> all($1::text[])
     order by s.name nulls last, a.name nulls last, p.last_name nulls last, p.first_name nulls last`,
    [[...processedExternalIds]],
  );
  const missingExternalIds = result.rows.map((row) => row.external_id);
  summary.missingEnrollments = missingExternalIds.length;
  if (missingExternalIds.length === 0) return;

  const details = result.rows
    .slice(0, 20)
    .map((row) => {
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "sin nombre";
      return `external_id=${row.external_id}; hoja=${row.sector ?? "sin hoja"}; fila=no disponible; DNI=${row.dni ?? "sin DNI"}; nombre=${name}; actividad=${row.activity ?? "sin actividad"}; estado=${row.status ?? "sin estado"}; motivo=no apareció un external_id equivalente en las filas leídas del último import (posible baja en Sheets, cambio de DNI/persona/actividad/estado/external_id o rango incompleto)`;
    });
  const suffix = result.rows.length > details.length ? ` (+${result.rows.length - details.length} más)` : "";
  const warning = `${missingExternalIds.length} inscripciones google_sheets no aparecieron en el último import${suffix}. Detalle: ${details.join(" | ")}`;
  summary.warnings.push(warning);
  if (
    summary.missingEnrollmentsAction === "noop" ||
    summary.missingEnrollmentsAction === "warn"
  )
    return;

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

  if (
    summary.missingEnrollmentsAction === "inactive" ||
    summary.missingEnrollmentsAction === "archive"
  ) {
    const archiveColumns = await getEnrollmentArchiveColumns(pool);
    if (!archiveColumns.has("inactive")) {
      summary.warnings.push(
        `GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY=${summary.missingEnrollmentsAction} no aplicó cambios porque miclub.enrollments.inactive no existe. Ejecutá el SQL manual documentado para habilitar el archivado seguro; el import continúa como warn.`,
      );
      return;
    }

    const setClauses = ["inactive = true", "updated_at = now()"];
    if (archiveColumns.has("inactive_reason")) {
      setClauses.push("inactive_reason = 'missing_from_google_sheets_import'");
    }
    if (archiveColumns.has("inactive_at")) {
      setClauses.push("inactive_at = coalesce(inactive_at, now())");
    }
    if (archiveColumns.has("superseded_at")) {
      setClauses.push("superseded_at = coalesce(superseded_at, now())");
    }
    if (archiveColumns.has("superseded_reason")) {
      setClauses.push("superseded_reason = 'missing_from_google_sheets_import'");
    }

    await pool.query(
      `update miclub.enrollments
       set ${setClauses.join(", ")}
       where source = 'google_sheets'
         and external_id = any($1::text[])`,
      [missingExternalIds],
    );
    summary.attemptedWrites += 1;
    summary.persistedWrites += 1;
  }
};

export const importGoogleSheets = async (
  options: ImportOptions = {},
): Promise<ImportSummary> => {
  const dryRun = options.dryRun ?? true;
  const batchSize = options.batchSize ?? 50;
  const pool = await getPostgresPool();
  const strategy =
    options.missingEnrollmentStrategy ?? parseMissingEnrollmentStrategy();
  const batchId = await createImportBatch(pool, {
    source: "google_sheets",
    dryRun,
    notes: dryRun ? "Dry run: solo valida y revierte entidades." : undefined,
  });
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
    operationalBalancesProcessed: 0,
    sheetMetricSnapshotsProcessed: 0,
    missingEnrollments: 0,
    missingEnrollmentsAction: strategy,
    errors: 0,
    warnings: [],
    movementFallbacks: { safeColumn: 0, fullLayout: 0 },
  };
  const processedEnrollmentExternalIds = new Set<string>();
  try {
    const { rows, adminBalanceRows, metricRanges } = await readRows();
    summary.read = rows.length;
    const balanceAttemptedWritesStart = summary.attemptedWrites;
    await pool.query("begin");
    try {
      await upsertOperationalBalances(pool, adminBalanceRows, summary);
      await upsertSheetMetricSnapshots(pool, metricRanges, summary);
      if (dryRun) {
        await pool.query("rollback");
        summary.rolledBackWrites +=
          summary.attemptedWrites - balanceAttemptedWritesStart;
      } else {
        await pool.query("commit");
        summary.persistedWrites +=
          summary.attemptedWrites - balanceAttemptedWritesStart;
      }
    } catch (error) {
      await pool.query("rollback");
      summary.rolledBackWrites +=
        summary.attemptedWrites - balanceAttemptedWritesStart;
      throw error;
    }
    for (const group of chunk(rows, batchSize)) {
      const groupErrors: Array<{ row: SheetRow; error: unknown }> = [];
      const groupAttemptedWritesStart = summary.attemptedWrites;
      await pool.query("begin");
      try {
        for (const row of group) {
          try {
            if (row.kind === "members") {
              const enrollmentExternalId = await processMember(
                pool,
                row,
                summary,
              );
              if (enrollmentExternalId)
                processedEnrollmentExternalIds.add(enrollmentExternalId);
            } else await processMovement(pool, row, summary);
          } catch (error) {
            summary.errors += 1;
            groupErrors.push({ row, error });
          }
        }
        if (dryRun) {
          await pool.query("rollback");
          summary.rolledBackWrites +=
            summary.attemptedWrites - groupAttemptedWritesStart;
        } else {
          await pool.query("commit");
          summary.persistedWrites +=
            summary.attemptedWrites - groupAttemptedWritesStart;
        }
      } catch (error) {
        await pool.query("rollback");
        summary.rolledBackWrites +=
          summary.attemptedWrites - groupAttemptedWritesStart;
        throw error;
      }
      for (const { row, error } of groupErrors)
        await logImportError(pool, {
          batchId,
          sourceTable: row.kind,
          sourceRow: `${row.sheet}:${row.rowNumber}`,
          error,
          rawPayload: row.row,
        });
    }
    await reconcileMissingEnrollments(
      pool,
      processedEnrollmentExternalIds,
      summary,
    );
    await finishImportBatch(
      pool,
      batchId,
      dryRun
        ? "dry_run"
        : summary.errors > 0
          ? "completed_with_errors"
          : "completed",
      JSON.stringify(summary),
    );
    return summary;
  } catch (error) {
    await finishImportBatch(
      pool,
      batchId,
      "failed",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
};


export const getMovementImportAudit = async () => {
  const pool = await getPostgresPool();
  const result = await pool.query(`
    select
      coalesce(s.name, 'Sin sector') as sector,
      coalesce(c.name, 'Sin categoría') as category,
      m.movement_type as type,
      m.operational_status as status,
      count(*)::int as count
    from miclub.movements m
    left join miclub.sectors s on s.id = m.sector_id
    left join miclub.movement_categories c on c.id = m.category_id
    where m.source = 'google_sheets'
    group by 1, 2, 3, 4
    order by 1, 2, 3, 4
  `);
  const totals = { total: 0, bySector: {} as Record<string, number>, byCategory: {} as Record<string, number>, byType: {} as Record<string, number>, byStatus: {} as Record<string, number> };
  for (const row of result.rows as Array<{ sector: string; category: string; type: string; status: string; count: number }>) {
    const count = Number(row.count);
    totals.total += count;
    totals.bySector[row.sector] = (totals.bySector[row.sector] ?? 0) + count;
    totals.byCategory[row.category] = (totals.byCategory[row.category] ?? 0) + count;
    totals.byType[row.type] = (totals.byType[row.type] ?? 0) + count;
    totals.byStatus[row.status] = (totals.byStatus[row.status] ?? 0) + count;
  }
  return { totals, rows: result.rows };
};
