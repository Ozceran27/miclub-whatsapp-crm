# Runbook definitivo de identidad y tenant

1. Tomar backup PostgreSQL y ejecutar `docs/dbeaver/01_auth_tenant_diagnostic_readonly.sql`.
2. Aplicar migraciones versionadas con `npm run db:migrate`. No ejecutar desde esta auditoría.
3. Ejecutar manualmente `docs/dbeaver/02_miclub_backfill_manual.sql`; revisar que conteos y sumas no cambien.
4. En un proceso aislado, definir `BOOTSTRAP_DIRECTOR_ENABLED=true` y
   `BOOTSTRAP_DIRECTOR_PASSWORD` (no usar historial de shell compartido), ejecutar
   `npm run bootstrap:director`, y retirar inmediatamente ambas variables.
5. Mantener `AUTH_ENABLED=true`, un `SESSION_SECRET` aleatorio y
   `LEGACY_AUTH_ENABLED`, `AUTH_USER`, `AUTH_PASSWORD` ausentes.
6. Ejecutar `docs/dbeaver/03_final_validation_readonly.sql`; todo debe ser `PASS`.
7. Validar localhost y Cloudflare: login, `/auth/me`, `/api/db/health`,
   `/api/import/batches`, logout, `/auth/me` 401, F5, Back y dos pestañas.

La CLI no imprime contraseña ni hash. Actualiza la cuenta deliberadamente sólo
cuando el operador proporciona una contraseña temporal; revoca sesiones previas
y registra `bootstrap.director` en `miclub.audit_log`.
