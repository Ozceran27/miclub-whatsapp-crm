import { XLSX_POLICY } from "./policy.js";
import { inspectZip, readEntry } from "./zipInspector.js";
export type MigrationIssue = { error_code: string; message: string; severity: "error"|"warning"; sheet?: string; row_number?: number; entity_type?: string; field?: string; value_normalized?: string };
const issue = (error_code: string, message: string, extra: Partial<MigrationIssue> = {}): MigrationIssue => ({ error_code, message, severity: "error", ...extra });
export function validateWorkbook(buffer: Buffer, filename: string, mime: string) {
  const errors: MigrationIssue[] = [];
  if (!/\.xlsx$/i.test(filename)) errors.push(issue("INVALID_EXTENSION", "La extensión debe ser .xlsx."));
  if (mime !== XLSX_POLICY.mime && mime !== "application/octet-stream") errors.push(issue("INVALID_MIME", "El MIME no corresponde a XLSX."));
  if (buffer.length > XLSX_POLICY.maxCompressedBytes) errors.push(issue("COMPRESSED_SIZE_LIMIT", "El archivo excede 8 MiB."));
  if (errors.length) return { errors, sheets: [], rowCounts: {} as Record<string,number> };
  const entries = inspectZip(buffer);
  const names = entries.map((entry) => entry.name.toLowerCase());
  if (names.some((name) => name.endsWith("vbaproject.bin") || name.endsWith(".xlsm"))) errors.push(issue("MACROS_NOT_ALLOWED", "No se permiten macros."));
  if (names.some((name) => name.includes("externallinks/"))) errors.push(issue("EXTERNAL_LINKS_NOT_ALLOWED", "No se permiten enlaces externos."));
  const workbookEntry = entries.find((entry) => entry.name === "xl/workbook.xml");
  if (!workbookEntry) errors.push(issue("INVALID_XLSX", "Falta xl/workbook.xml."));
  const workbook = workbookEntry ? readEntry(buffer, workbookEntry) : "";
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"/g)].map((match) => match[1]);
  if (JSON.stringify(sheets) !== JSON.stringify(XLSX_POLICY.sheets)) errors.push(issue("INVALID_SHEETS", `Se requieren únicamente: ${XLSX_POLICY.sheets.join(", ")}.`));
  const stringsEntry = entries.find((entry) => entry.name === "xl/sharedStrings.xml");
  const sharedStrings = stringsEntry ? readEntry(buffer, stringsEntry) : "";
  const requiredHeaders = ["Fecha", "Tipo", "Categoría", "Concepto", "Contra-parte", "Sector", "Monto", "Impuestos", "M.P.", "Nombre", "Apellido", "D.N.I.", "Tel.", "Actividad", "Modalidad", "Cuota", "Estado", "Instructor", "Vence"];
  for (const header of requiredHeaders) if (!sharedStrings.includes(`<t>${header}</t>`)) errors.push(issue("INVALID_HEADERS", `Falta el encabezado requerido: ${header}.`, { field: header }));
  const rowCounts: Record<string,number> = {};
  entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)).forEach((entry, index) => {
    const xml = readEntry(buffer, entry); const sheet = sheets[index] ?? entry.name;
    if (/<f(?:\s|>)/i.test(xml)) errors.push(issue("FORMULAS_NOT_ALLOWED", "No se permiten fórmulas; use valores almacenados.", { sheet }));
    const rowMatches = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
    const populatedRows = rowMatches.filter((match) => Number(match[1]) > 2 && /<(?:v|t)>[^<]+<\/(?:v|t)>/.test(match[2]));
    rowCounts[sheet] = populatedRows.length;
    const lastPopulatedRow = Number(populatedRows.at(-1)?.[1] ?? 0);
    if (lastPopulatedRow > XLSX_POLICY.maxRowsPerSheet + 2 || populatedRows.length > XLSX_POLICY.maxRowsPerSheet) errors.push(issue("ROW_LIMIT", "La hoja excede el máximo de filas.", { sheet, row_number: lastPopulatedRow }));
  });
  return { errors, sheets, rowCounts };
}
