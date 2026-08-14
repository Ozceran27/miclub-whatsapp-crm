# Importación XLSX

El endpoint `/api/migration` recibe un XLSX, valida estructura ZIP, referencias, identidad del lote y permisos antes de persistir. Ejecute primero dry-run y archive el reporte y hash del snapshot. La importación Google Sheets está aislada en `importers/googleSheets`, `legacy/googleSheets` y su script operativo; no se monta en rutas ni servicios productivos. `npm run check:no-google-sheets-runtime` hace fallar CI si ese límite se rompe.

No retire `googleapis`, sus variables, los scripts `import:sheets*` ni los módulos aislados hasta registrar un E2E XLSX real exitoso. Después de certificarlo, retire esos elementos y conserve fuera del runtime sólo la evidencia forense indispensable. Antes y después del retiro ejecute `npm run check:no-google-sheets-runtime`, `npm run deadcode`, `npm run build` y `npm run test -ws --if-present` para confirmar que no queda un consumidor activo. Aplique el mismo criterio a `sqlite3`.
