# Runbook de despliegue

- Ejecutar `npm ci`, migraciones, `npm run check` y el E2E XLSX.
- Usar PostgreSQL, autenticación y HTTPS obligatorios.
- En staging y producción mantener `IMPORT_ENDPOINTS_ENABLED=false`, `GOOGLE_SHEETS_ENABLED=false` y `GOOGLE_SHEETS_IMPORT_ENABLED=false`.
- Verificar que `/api/modules/navigation` refleja únicamente módulos y sectores persistidos del tenant.
- Para el entorno efímero destinado al **primer E2E**, fijar explícitamente
  `PUBLIC_REGISTRATION_ENABLED=true`, ejecutar
  `npm run db:public-registration:integration` y conservar su salida. Al terminar,
  destruir ese entorno o cambiar la variable explícitamente a `false`.
- En desarrollo compartido, staging, producción y cualquier otro entorno,
  decidir y registrar la variable: el valor normal es
  `PUBLIC_REGISTRATION_ENABLED=false`. Sólo puede usarse `true` durante una
  ventana de alta pública aprobada, con rate limit y monitoreo activos; no se
  admite omitir la variable ni heredar el valor del primer E2E.
- Antes del reset, `01_pre_reset_audit.sql` debe acreditar exactamente un plan
  `FREE` provisionable y catálogos globales requeridos no vacíos. Después del
  reset, `03_post_reset_validation.sql` debe volver a acreditar ambas condiciones.
- No modificar migraciones históricas; agregar una nueva migración y actualizar el manifiesto.
- Para aprovisionar los logins, completar `ADMIN_*`, aplicar RLS y validar el
  aislamiento, seguir [`runtime-rls-rollout.md`](runtime-rls-rollout.md).
