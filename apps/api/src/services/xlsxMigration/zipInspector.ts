import { inflateRawSync } from "node:zlib";
import { XLSX_POLICY } from "./policy.js";

export type ZipEntry = { name: string; compressedSize: number; expandedSize: number; method: number; localOffset: number };
const fail = (code: string, message: string): never => { const error = new Error(message) as Error & { code: string }; error.code = code; throw error; };
export function inspectZip(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) fail("INVALID_ZIP_SIGNATURE", "El archivo no tiene firma ZIP válida.");
  const eocd = buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) fail("INVALID_ZIP", "Directorio ZIP inválido.");
  const count = buffer.readUInt16LE(eocd + 10), centralOffset = buffer.readUInt32LE(eocd + 16);
  if (count > XLSX_POLICY.maxEntries) fail("TOO_MANY_ENTRIES", "El XLSX contiene demasiadas entradas.");
  const entries: ZipEntry[] = []; let offset = centralOffset; let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) fail("INVALID_ZIP", "Entrada ZIP inválida.");
    const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20), expandedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.includes("..") || name.startsWith("/") || name.includes("\\")) fail("UNSAFE_ZIP_PATH", "El ZIP contiene una ruta insegura.");
    expanded += expandedSize;
    entries.push({ name, method, compressedSize, expandedSize, localOffset: buffer.readUInt32LE(offset + 42) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (expanded > XLSX_POLICY.maxExpandedBytes) fail("EXPANDED_SIZE_LIMIT", "El XLSX expandido excede el límite.");
  const compressed = entries.reduce((sum, item) => sum + item.compressedSize, 0);
  if (compressed && expanded / compressed > XLSX_POLICY.maxCompressionRatio) fail("COMPRESSION_RATIO_LIMIT", "La relación de compresión es insegura.");
  return entries;
}
export function readEntry(buffer: Buffer, entry: ZipEntry): string {
  const offset = entry.localOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) fail("INVALID_ZIP", "Cabecera ZIP inválida.");
  const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method !== 8) fail("UNSUPPORTED_COMPRESSION", "Método de compresión no permitido.");
  const output = inflateRawSync(data, { maxOutputLength: XLSX_POLICY.maxExpandedBytes });
  if (output.length !== entry.expandedSize) fail("INVALID_ZIP_SIZE", "Tamaño expandido inconsistente.");
  return output.toString("utf8");
}
