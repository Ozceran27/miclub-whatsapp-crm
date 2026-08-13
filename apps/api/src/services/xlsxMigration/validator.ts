import { XLSX_POLICY } from "./policy.js";
import { inspectZip, readEntry } from "./zipInspector.js";
import { normalizeComparableText } from "../../importers/normalizers.js";
import type { ReferenceRow } from "./referenceResolver.js";
export type MigrationIssue = { error_code: string; message: string; severity: "error"|"warning"; sheet?: string; row_number?: number; entity_type?: string; field?: string; value_normalized?: string };
const issue = (error_code: string, message: string, extra: Partial<MigrationIssue> = {}): MigrationIssue => ({ error_code, message, severity: "error", ...extra });
export function validateWorkbook(buffer: Buffer, filename: string, mime: string) {
  const errors: MigrationIssue[] = [];
  if (!/\.xlsx$/i.test(filename)) errors.push(issue("INVALID_EXTENSION", "La extensión debe ser .xlsx."));
  if (mime !== XLSX_POLICY.mime && mime !== "application/octet-stream") errors.push(issue("INVALID_MIME", "El MIME no corresponde a XLSX."));
  if (buffer.length > XLSX_POLICY.maxCompressedBytes) errors.push(issue("COMPRESSED_SIZE_LIMIT", "El archivo excede 8 MiB."));
  if (errors.length) return { errors, sheets: [], rowCounts: {} as Record<string,number>, referenceRows: [] as ReferenceRow[] };
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
  const strings=[...sharedStrings.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match)=>[...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part)=>part[1]).join(""));
  const requiredHeaders = ["Fecha", "Tipo", "Categoría", "Concepto", "Contra-parte", "Sector", "Monto", "Impuestos", "M.P.", "Nombre", "Apellido", "D.N.I.", "Tel.", "Actividad", "Modalidad", "Cuota", "Estado", "Instructor", "Vence"];
  for (const header of requiredHeaders) if (!sharedStrings.includes(`<t>${header}</t>`)) errors.push(issue("INVALID_HEADERS", `Falta el encabezado requerido: ${header}.`, { field: header }));
  const rowCounts: Record<string,number> = {};
  const referenceRows:ReferenceRow[]=[];
  entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)).forEach((entry, index) => {
    const xml = readEntry(buffer, entry); const sheet = sheets[index] ?? entry.name;
    if (/<f(?:\s|>)/i.test(xml)) errors.push(issue("FORMULAS_NOT_ALLOWED", "No se permiten fórmulas; use valores almacenados.", { sheet }));
    const rowMatches = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
    const values=(body:string)=>new Map([...body.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((cell)=>{
      const column=cell[1].match(/\br="([A-Z]+)\d+"/)?.[1]??"";
      const raw=cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1]??cell[2].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1]??"";
      return [column,/\bt="s"/.test(cell[1])?strings[Number(raw)]??"":raw] as const;
    }));
    const headerValues=values(rowMatches.find((row)=>Number(row[1])===1)?.[2]??"");
    const columns=new Map([...headerValues].map(([column,value])=>[normalizeComparableText(value),column]));
    for(const match of rowMatches.filter((row)=>Number(row[1])>2)) {
      const cells=values(match[2]); if(![...cells.values()].some(Boolean)) continue;
      const get=(...headers:string[])=>{for(const header of headers){const column=columns.get(normalizeComparableText(header));if(column)return cells.get(column);}return undefined;};
      referenceRows.push({sheet,rowNumber:Number(match[1]),sector:get("Sector"),activity:get("Actividad"),modality:get("Modalidad"),instructor:get("Instructor","Responsable"),externalReference:get("External Reference","Referencia externa"),values:[...cells.values()]});
    }
    const populatedRows = rowMatches.filter((match) => Number(match[1]) > 2 && /<(?:v|t)>[^<]+<\/(?:v|t)>/.test(match[2]));
    rowCounts[sheet] = populatedRows.length;
    const lastPopulatedRow = Number(populatedRows.at(-1)?.[1] ?? 0);
    if (lastPopulatedRow > XLSX_POLICY.maxRowsPerSheet + 2 || populatedRows.length > XLSX_POLICY.maxRowsPerSheet) errors.push(issue("ROW_LIMIT", "La hoja excede el máximo de filas.", { sheet, row_number: lastPopulatedRow }));
  });
  return { errors, sheets, rowCounts, referenceRows };
}
