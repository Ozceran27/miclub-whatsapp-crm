import { MICLUB_XLSX_IMPORT_VERSION } from "@miclub/shared";

export const XLSX_POLICY = {
  templateVersion: MICLUB_XLSX_IMPORT_VERSION,
  maxCompressedBytes: 8 * 1024 * 1024,
  maxExpandedBytes: 40 * 1024 * 1024,
  maxCompressionRatio: 40,
  maxEntries: 128,
  maxRowsPerSheet: 10_000,
  sheets: ["ADMINISTRACIÓN", "INSCRIPCIONES"] as const,
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const TEMPLATE_FILENAME = "Modelo_Import_miClub.xlsx";
