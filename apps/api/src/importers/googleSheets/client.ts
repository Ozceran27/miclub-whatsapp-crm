/**
 * Cliente Google Sheets.
 *
 * Runtime legacy: no expone API pública nueva; el cliente real sigue encapsulado
 * en legacy.ts para no modificar endpoints ni cálculos en esta etapa.
 * Importación/migración: este módulo reserva el punto de extracción para lecturas batch/get.
 */
export { getGoogleSheetsConfig } from "./legacy.js";
