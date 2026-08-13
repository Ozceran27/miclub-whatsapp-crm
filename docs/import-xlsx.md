# Importación XLSX

El endpoint `/api/migration` recibe un XLSX, valida estructura ZIP, referencias, identidad del lote y permisos antes de persistir. Ejecute primero dry-run y archive el reporte y hash del snapshot. La importación Google Sheets y sus endpoints están deshabilitados en staging y fuera del runtime; cualquier comparación histórica se ejecuta desde tooling legacy contra exactamente el mismo snapshot exportado.

No retire `googleapis`, sus variables ni scripts hasta registrar un E2E XLSX exitoso y verificar con `npm run test -w @miclub/api` que la prueba de arquitectura no detecta imports runtime. Aplique el mismo criterio a `sqlite3`.
