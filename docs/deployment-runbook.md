# Runbook de despliegue

- Ejecutar `npm ci`, migraciones, `npm run check` y el E2E XLSX.
- Usar PostgreSQL, autenticación y HTTPS obligatorios.
- En staging y producción mantener `IMPORT_ENDPOINTS_ENABLED=false`, `GOOGLE_SHEETS_ENABLED=false` y `GOOGLE_SHEETS_IMPORT_ENABLED=false`.
- Verificar que `/api/modules/navigation` refleja únicamente módulos y sectores persistidos del tenant.
- No modificar migraciones históricas; agregar una nueva migración y actualizar el manifiesto.
