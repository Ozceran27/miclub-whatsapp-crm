# Importación XLSX

El endpoint `/api/migration` recibe un XLSX, valida estructura ZIP, referencias, identidad del lote y permisos antes de persistir. Ejecute primero dry-run y archive el reporte y hash del snapshot. Google Sheets fue retirado definitivamente después de certificar el E2E XLSX; `npm run check:no-google-sheets-runtime` hace fallar CI si reaparece su código, dependencia o punto de entrada.

La evidencia forense de migraciones anteriores se conserva en `docs/history/` y no es ejecutable. Para comprobar que el retiro no retrocede, ejecute `npm run check:no-google-sheets-runtime`, `npm run deadcode`, `npm run build` y `npm run test -ws --if-present`. Aplique una puerta independiente antes de retirar `sqlite3`.
