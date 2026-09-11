/** Contract describing the established miClub import workbook without changing it. */
export const MICLUB_XLSX_IMPORT_VERSION = "v4" as const;

export type XlsxImportColumn = Readonly<{
  key: string;
  header: string;
  headerCell: string;
  dataCell: string;
  type: "date" | "string" | "decimal" | "enum";
  enumValues?: readonly string[];
  required: boolean;
  derived?: "activity.sector" | "counterparty.document";
}>;

export type XlsxImportPhysicalColumn = Readonly<{
  column: string;
  /** `null` means that the template deliberately leaves this header empty. */
  header: string | null;
  key?: string;
  kind: "field" | "spacer";
}>;

const administrationPhysicalColumns = [
  ["A", "Fecha", "date"], ["B", null], ["C", "Tipo", "type"], ["D", null], ["E", null],
  ["F", "Categoría", "category"], ["G", null], ["H", null], ["I", "Concepto", "concept"],
  ["J", null], ["K", null], ["L", null], ["M", null], ["N", "Contra-parte", "counterparty"],
  ["O", null], ["P", null], ["Q", "Sector", "sector"], ["R", null], ["S", "Monto", "amount"],
  ["T", null], ["U", null], ["V", "Impuestos", "taxes"], ["W", null], ["X", "Estado", "status"],
  ["Y", null], ["Z", "M.P.", "paymentMethod"], ["AA", "Actividad", "activity"],
  ["AB", "Identificador de origen", "externalReference"], ["AC", "Cuenta", "account"],
] as const;

const enrollmentPhysicalColumns = [
  ["A", "Fecha", "date"], ["B", null], ["C", "Nombre", "firstName"], ["D", null], ["E", null],
  ["F", "Apellido", "lastName"], ["G", null], ["H", null], ["I", "D.N.I.", "document"],
  ["J", null], ["K", "Telefono", "phone"], ["L", null], ["M", "Actividad", "activity"],
  ["N", null], ["O", "Modalidad", "modality"], ["P", null], ["Q", "Cuota", "fee"],
  ["R", null], ["S", "Estado", "status"], ["T", null], ["U", null],
  ["V", "Identificador de origen", "externalReference"],
] as const;

const physicalColumns = (items: readonly (readonly [string, string | null, string?])[]): readonly XlsxImportPhysicalColumn[] =>
  items.map(([column, header, key]) => ({ column, header, key, kind: header === null ? "spacer" : "field" }));

export const XLSX_IMPORT_V1_SCHEMA = {
  version: MICLUB_XLSX_IMPORT_VERSION,
  versionDetection: "sheet-and-header-signature",
  sheetOrderContractual: false,
  preservesPhysicalWorkbook: true,
  sheets: {
    movements: {
      name: "ADMINISTRACIÓN",
      headerRow: 1,
      firstDataRow: 2,
      physicalColumns: physicalColumns(administrationPhysicalColumns),
      columns: [
        { key: "date", header: "Fecha", headerCell: "A1", dataCell: "A2", type: "date", required: true },
        { key: "type", header: "Tipo", headerCell: "C1", dataCell: "C2", type: "enum", enumValues: ["INGRESOS", "EGRESOS", "CAPITAL"], required: true },
        { key: "category", header: "Categoría", headerCell: "F1", dataCell: "F2", type: "string", required: true },
        { key: "concept", header: "Concepto", headerCell: "I1", dataCell: "I2", type: "string", required: true },
        { key: "counterparty", header: "Contra-parte", headerCell: "N1", dataCell: "N2", type: "string", required: false, derived: "counterparty.document" },
        { key: "sector", header: "Sector", headerCell: "Q1", dataCell: "Q2", type: "string", required: false, derived: "activity.sector" },
        { key: "amount", header: "Monto", headerCell: "S1", dataCell: "S2", type: "decimal", required: true },
        { key: "taxes", header: "Impuestos", headerCell: "V1", dataCell: "V2", type: "decimal", required: false },
        { key: "status", header: "Estado", headerCell: "X1", dataCell: "X2", type: "enum", enumValues: ["COMPLETADO", "PENDIENTE", "CANCELADO", "ANULADO"], required: true },
        { key: "paymentMethod", header: "M.P.", headerCell: "Z1", dataCell: "Z2", type: "string", required: false },
        { key: "activity", header: "Actividad", headerCell: "AA1", dataCell: "AA2", type: "string", required: false },
        { key: "externalReference", header: "Identificador de origen", headerCell: "AB1", dataCell: "AB2", type: "string", required: true },
        { key: "account", header: "Cuenta", headerCell: "AC1", dataCell: "AC2", type: "string", required: true },
      ] satisfies readonly XlsxImportColumn[],
    },
    enrollments: {
      name: "INSCRIPCIONES",
      headerRow: 1,
      firstDataRow: 2,
      physicalColumns: physicalColumns(enrollmentPhysicalColumns),
      columns: [
        { key: "date", header: "Fecha", headerCell: "A1", dataCell: "A2", type: "date", required: true },
        { key: "firstName", header: "Nombre", headerCell: "C1", dataCell: "C2", type: "string", required: true },
        { key: "lastName", header: "Apellido", headerCell: "F1", dataCell: "F2", type: "string", required: true },
        { key: "document", header: "D.N.I.", headerCell: "I1", dataCell: "I2", type: "string", required: true },
        { key: "phone", header: "Telefono", headerCell: "K1", dataCell: "K2", type: "string", required: false },
        { key: "activity", header: "Actividad", headerCell: "M1", dataCell: "M2", type: "string", required: true },
        { key: "modality", header: "Modalidad", headerCell: "O1", dataCell: "O2", type: "string", required: false },
        { key: "fee", header: "Cuota", headerCell: "Q1", dataCell: "Q2", type: "decimal", required: true },
        { key: "status", header: "Estado", headerCell: "S1", dataCell: "S2", type: "enum", enumValues: ["ACTIVA", "AL DÍA", "NUEVO INSCRIPTO", "ADEUDANDO", "ABANDONADO", "CANCELADA"], required: true },
        { key: "externalReference", header: "Identificador de origen", headerCell: "V1", dataCell: "V2", type: "string", required: true },
      ] satisfies readonly XlsxImportColumn[],
      derived: { sector: "activity.sector", instructor: "activity.instructor" },
    },
    opening: {
      name: 'SALDOS_INICIALES', headerRow: 1, firstDataRow: 2,
      physicalColumns: physicalColumns([['A','Identificador de origen','externalReference'],['B','D.N.I.','document'],['C','Actividad','activity'],['D','Tipo','kind'],['E','Moneda','currency'],['F','Saldo','amount'],['G','Vencimiento','date']]),
      columns: [
        { key: 'externalReference', header: 'Identificador de origen', headerCell: 'A1', dataCell: 'A2', type: 'string', required: true },
        { key: 'document', header: 'D.N.I.', headerCell: 'B1', dataCell: 'B2', type: 'string', required: true },
        { key: 'activity', header: 'Actividad', headerCell: 'C1', dataCell: 'C2', type: 'string', required: false },
        { key: 'kind', header: 'Tipo', headerCell: 'D1', dataCell: 'D2', type: 'enum', enumValues: ['STUDENT','RESPONSIBLE','EMPLOYEE','SUPPLIER'], required: true },
        { key: 'currency', header: 'Moneda', headerCell: 'E1', dataCell: 'E2', type: 'enum', enumValues: ['ARS','USD','EUR','BRL'], required: true },
        { key: 'amount', header: 'Saldo', headerCell: 'F1', dataCell: 'F2', type: 'decimal', required: true },
        { key: 'date', header: 'Vencimiento', headerCell: 'G1', dataCell: 'G2', type: 'date', required: true },
      ] satisfies readonly XlsxImportColumn[],
    },
  },
} as const;

export type XlsxWorkbookSignature = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export function detectMiclubXlsxImportVersion(workbook: XlsxWorkbookSignature): typeof MICLUB_XLSX_IMPORT_VERSION {
  for (const sheet of Object.values(XLSX_IMPORT_V1_SCHEMA.sheets)) {
    const cells = workbook[sheet.name];
    if (!cells || sheet.physicalColumns.some(({column, header}) => {
      const value = cells[`${column}${sheet.headerRow}`];
      return (typeof value === "string" ? value : "") !== (header ?? "");
    })) {
      throw new Error(`Formato XLSX desconocido: la firma de ${sheet.name} no corresponde a v4. Descargá la plantilla con Actividad, Cuenta, Identificador de origen y SALDOS_INICIALES.`);
    }
  }
  return MICLUB_XLSX_IMPORT_VERSION;
}
