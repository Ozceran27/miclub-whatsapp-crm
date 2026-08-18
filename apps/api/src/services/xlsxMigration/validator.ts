import { XLSX_IMPORT_V1_SCHEMA, type XlsxImportColumn } from "@miclub/shared";
import { XLSX_POLICY } from "./policy.js";
import type { ReferenceRow } from "./referenceResolver.js";
import { inspectZip, readEntry, type ZipEntry } from "./zipInspector.js";

export type MigrationIssue = { error_code: string; message: string; severity: "error"|"warning"; sheet?: string; row_number?: number; entity_type?: string; field?: string; value_normalized?: string };
export type ParsedWorkbookRow = { sheet:string; rowNumber:number; values:Record<string,string|number|null>; sourceValues:unknown[] };

const issue = (error_code: string, message: string, extra: Partial<MigrationIssue> = {}): MigrationIssue => ({ error_code, message, severity: "error", ...extra });
const decodeXml = (value:string) => value.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (entity:string, hex:string|undefined, decimal:string|undefined, named:string|undefined) =>
  hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : decimal ? String.fromCodePoint(Number(decimal)) : ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"} as Record<string,string>)[named??""] ?? entity);
const columnOf = (coordinate:string) => coordinate.match(/^([A-Z]+)\d+$/)?.[1] ?? "";
const emptyResult = (errors:MigrationIssue[]) => ({ errors, sheets: [] as string[], rowCounts: {} as Record<string,number>, referenceRows: [] as ReferenceRow[], rows:[] as ParsedWorkbookRow[] });

function sharedStringTable(xml:string):string[] {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join(""));
}

function cells(body:string, strings:string[]):Map<string,string> {
  return new Map([...body.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
    const coordinate=cell[1].match(/\br="([A-Z]+\d+)"/)?.[1]??"";
    const raw=cell[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? cell[2].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1] ?? "";
    return [coordinate, /\bt="s"/.test(cell[1]) ? strings[Number(raw)]??"" : decodeXml(raw)] as const;
  }));
}

function sheetEntries(workbook:string, relationships:string, entries:ZipEntry[]):Array<{name:string;entry?:ZipEntry}> {
  const targets=new Map([...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match)=>{
    const id=match[1].match(/\bId="([^"]+)"/)?.[1]??"";
    const target=match[1].match(/\bTarget="([^"]+)"/)?.[1]??"";
    return [id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//,"")}`] as const;
  }));
  return [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map((match)=>{
    const name=decodeXml(match[1].match(/\bname="([^"]+)"/)?.[1]??"");
    const id=match[1].match(/\br:id="([^"]+)"/)?.[1]??"";
    const target=targets.get(id)?.replace(/\/[^/]+\/\.\./g,"");
    return {name,entry:entries.find((candidate)=>candidate.name===target)};
  });
}

function parseDate(raw:string):string|null {
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial=Number(raw); if (!(serial>0)) return null;
    return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
  }
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return null;
  const date=new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10)!==raw ? null : raw;
}

function parseDecimal(raw:string):number|null {
  const compact=raw.replace(/\s/g,"");
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?)$/.test(compact)) return null;
  const canonical=compact.includes(",") ? compact.replace(/\./g,"").replace(",",".") : compact;
  const value=Number(canonical); return Number.isFinite(value) ? value : null;
}

export function validateWorkbook(buffer: Buffer, filename: string, mime: string) {
  const errors: MigrationIssue[] = [];
  if (!/\.xlsx$/i.test(filename)) errors.push(issue("INVALID_EXTENSION", "La extensión debe ser .xlsx."));
  if (mime !== XLSX_POLICY.mime && mime !== "application/octet-stream") errors.push(issue("INVALID_MIME", "El MIME no corresponde a XLSX."));
  if (buffer.length > XLSX_POLICY.maxCompressedBytes) errors.push(issue("COMPRESSED_SIZE_LIMIT", "El archivo excede 8 MiB."));
  if (errors.length) return emptyResult(errors);
  let entries:ZipEntry[];
  try { entries=inspectZip(buffer); } catch (error) {
    const failure=error as Error & {code?:string};
    return emptyResult([issue(failure.code??"INVALID_XLSX",failure.message)]);
  }
  const names = entries.map((entry) => entry.name.toLowerCase());
  if (names.some((name) => name.endsWith("vbaproject.bin") || name.endsWith(".xlsm"))) errors.push(issue("MACROS_NOT_ALLOWED", "No se permiten macros."));
  if (names.some((name) => name.includes("externallinks/"))) errors.push(issue("EXTERNAL_LINKS_NOT_ALLOWED", "No se permiten enlaces externos."));
  const workbookEntry=entries.find((entry)=>entry.name==="xl/workbook.xml");
  const relationsEntry=entries.find((entry)=>entry.name==="xl/_rels/workbook.xml.rels");
  if (!workbookEntry||!relationsEntry) return emptyResult([...errors,issue("INVALID_XLSX", "Falta la estructura del libro XLSX.")]);
  const workbook=readEntry(buffer,workbookEntry);
  const sheetFiles=sheetEntries(workbook,readEntry(buffer,relationsEntry),entries);
  const sheets=sheetFiles.map(({name})=>name);
  if (JSON.stringify(sheets)!==JSON.stringify(XLSX_POLICY.sheets)) errors.push(issue("INVALID_SHEETS", `Se requieren únicamente: ${XLSX_POLICY.sheets.join(", ")}.`));
  const stringsEntry=entries.find((entry)=>entry.name==="xl/sharedStrings.xml");
  const strings=sharedStringTable(stringsEntry?readEntry(buffer,stringsEntry):"");
  const rowCounts:Record<string,number>={}; const referenceRows:ReferenceRow[]=[]; const rows:ParsedWorkbookRow[]=[];

  for (const {name:sheet,entry} of sheetFiles) {
    const schema=Object.values(XLSX_IMPORT_V1_SCHEMA.sheets).find((candidate)=>candidate.name===sheet);
    if (!entry||!schema) continue;
    const xml=readEntry(buffer,entry);
    if (/<f(?:\s|>)/i.test(xml)) errors.push(issue("FORMULAS_NOT_ALLOWED", "No se permiten fórmulas; use valores almacenados.", {sheet}));
    const rowMatches=[...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
    const headerCells=cells(rowMatches.find((row)=>Number(row[1])===schema.headerRow)?.[2]??"",strings);
    for (const column of schema.columns as readonly XlsxImportColumn[]) {
      const actual=headerCells.get(column.headerCell)??"";
      if (actual!==column.header) errors.push(issue("INVALID_HEADERS", `Se esperaba ${column.header} en ${column.headerCell}.`,{sheet,row_number:schema.headerRow,field:column.key,value_normalized:actual}));
    }
    const populated=rowMatches.filter((match)=>Number(match[1])>=schema.firstDataRow&&[...cells(match[2],strings).values()].some((value)=>value.trim()!==""));
    for (const match of populated) {
      const rowNumber=Number(match[1]), rowCells=cells(match[2],strings), parsed:Record<string,string|number|null>={};
      const rawFor=(column:XlsxImportColumn)=>rowCells.get(`${columnOf(column.dataCell)}${rowNumber}`);
      for (const column of schema.columns as readonly XlsxImportColumn[]) {
        const raw=rawFor(column), normalized=String(raw??"").trim(); let value:string|number|null=normalized||null;
        if (normalized&&column.type==="decimal") { const decimal=parseDecimal(normalized); if(decimal===null) errors.push(issue("INVALID_DECIMAL",`${column.header} debe ser decimal.`,{sheet,row_number:rowNumber,field:column.key,value_normalized:normalized})); else value=decimal; }
        if (normalized&&column.type==="date") { const date=parseDate(normalized); if(date===null) errors.push(issue("INVALID_DATE",`${column.header} debe ser una fecha válida.`,{sheet,row_number:rowNumber,field:column.key,value_normalized:normalized})); else value=date; }
        if (normalized&&column.type==="enum"&&column.enumValues&&!column.enumValues.includes(normalized)) errors.push(issue("INVALID_ENUM",`${column.header} no pertenece al catálogo permitido.`,{sheet,row_number:rowNumber,field:column.key,value_normalized:normalized}));
        if (column.required&&value===null) errors.push(issue("REQUIRED_VALUE",`Falta ${column.header}.`,{sheet,row_number:rowNumber,field:column.key}));
        parsed[column.key]=value;
      }
      const sourceValues=(schema.columns as readonly XlsxImportColumn[]).map((column)=>rawFor(column)??null);
      const get=(key:string)=>parsed[key]??undefined;
      rows.push({sheet,rowNumber,values:parsed,sourceValues});
      referenceRows.push({sheet,rowNumber,sector:get("sector"),activity:get("activity"),modality:get("modality"),instructor:get("instructor"),category:get("category"),paymentMethod:get("paymentMethod"),document:get("document")??get("counterparty"),externalReference:get("externalReference"),values:sourceValues});
    }
    rowCounts[sheet]=populated.length;
    const last=Number(populated.at(-1)?.[1]??0);
    if(last>schema.firstDataRow+XLSX_POLICY.maxRowsPerSheet-1||populated.length>XLSX_POLICY.maxRowsPerSheet) errors.push(issue("ROW_LIMIT","La hoja excede el máximo de filas.",{sheet,row_number:last}));
  }
  return {errors,sheets,rowCounts,referenceRows,rows};
}
