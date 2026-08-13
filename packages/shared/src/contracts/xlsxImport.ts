/** Contract describing the established miClub import workbook without changing it. */
export const MICLUB_XLSX_IMPORT_VERSION = "v1" as const;

export type XlsxImportColumn = Readonly<{
  key: string;
  header: string;
  headerCell: string;
  dataCell: string;
  type: "date" | "string" | "decimal" | "enum";
  required: boolean;
  derived?: "activity.sector" | "counterparty.document";
}>;

export const XLSX_IMPORT_V1_SCHEMA = {
  version: MICLUB_XLSX_IMPORT_VERSION,
  versionDetection: "sheet-and-header-signature",
  preservesPhysicalWorkbook: true,
  sheets: {
    movements: {
      name: "ADMINISTRACIÓN",
      headerRow: 1,
      firstDataRow: 2,
      columns: [
        { key: "date", header: "Fecha", headerCell: "A1", dataCell: "A2", type: "date", required: true },
        { key: "type", header: "Tipo", headerCell: "C1", dataCell: "C2", type: "enum", required: true },
        { key: "category", header: "Categoría", headerCell: "F1", dataCell: "F2", type: "string", required: true },
        { key: "concept", header: "Concepto", headerCell: "I1", dataCell: "I2", type: "string", required: true },
        { key: "counterparty", header: "Contra-parte", headerCell: "N1", dataCell: "N2", type: "string", required: false, derived: "counterparty.document" },
        { key: "sector", header: "Sector", headerCell: "Q1", dataCell: "Q2", type: "string", required: false, derived: "activity.sector" },
        { key: "amount", header: "Monto", headerCell: "S1", dataCell: "S2", type: "decimal", required: true },
        { key: "taxes", header: "Impuestos", headerCell: "V1", dataCell: "V2", type: "decimal", required: false },
        { key: "status", header: "Estado", headerCell: "X1", dataCell: "X2", type: "enum", required: true },
        { key: "paymentMethod", header: "M.P.", headerCell: "Z1", dataCell: "Z2", type: "string", required: false },
      ] satisfies readonly XlsxImportColumn[],
    },
    enrollments: {
      name: "INSCRIPCIONES",
      headerRow: 1,
      firstDataRow: 2,
      columns: [
        { key: "date", header: "Fecha", headerCell: "A1", dataCell: "A2", type: "date", required: true },
        { key: "firstName", header: "Nombre", headerCell: "C1", dataCell: "C2", type: "string", required: true },
        { key: "lastName", header: "Apellido", headerCell: "F1", dataCell: "F2", type: "string", required: true },
        { key: "document", header: "D.N.I.", headerCell: "I1", dataCell: "I2", type: "string", required: true },
        { key: "phone", header: "Tel.", headerCell: "K1", dataCell: "K2", type: "string", required: false },
        { key: "activity", header: "Actividad", headerCell: "M1", dataCell: "M2", type: "string", required: true },
        { key: "modality", header: "Modalidad", headerCell: "O1", dataCell: "O2", type: "string", required: false },
        { key: "fee", header: "Cuota", headerCell: "Q1", dataCell: "Q2", type: "decimal", required: true },
        { key: "status", header: "Estado", headerCell: "S1", dataCell: "S2", type: "enum", required: true },
        { key: "instructor", header: "Instructor", headerCell: "V1", dataCell: "V2", type: "string", required: false },
        { key: "expiresOn", header: "Vence", headerCell: "X1", dataCell: "X2", type: "date", required: false },
      ] satisfies readonly XlsxImportColumn[],
      derived: { sector: "activity.sector" },
    },
  },
} as const;

export type XlsxWorkbookSignature = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export function detectMiclubXlsxImportVersion(workbook: XlsxWorkbookSignature): typeof MICLUB_XLSX_IMPORT_VERSION {
  for (const sheet of Object.values(XLSX_IMPORT_V1_SCHEMA.sheets)) {
    const cells = workbook[sheet.name];
    if (!cells || sheet.columns.some((column) => cells[column.headerCell] !== column.header)) {
      throw new Error(`Formato XLSX desconocido: la firma de ${sheet.name} no corresponde a v1.`);
    }
  }
  return MICLUB_XLSX_IMPORT_VERSION;
}
