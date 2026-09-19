# Runbook definitivo de identidad y tenant

1. Tomar backup PostgreSQL y ejecutar `docs/dbeaver/01_auth_tenant_diagnostic_readonly.sql`.
2. Consultar `public.miclub_schema_migrations` y conservar sus nombres/checksums. No
   renombrar migraciones ya aplicadas. Ejecutar `npm run db:migrations:check` y luego
   `npm run db:migrate`. El runner sigue exclusivamente el manifiesto versionado:
   primero el esquema base y las migraciones raíz históricas; después
   `multitenant/202607240001`–`202607240003` y el backfill `202607250001`; a
   continuación identidad/autorización, vistas multitenant y endurecimiento; por
   último los ajustes de importación. No ejecutar archivos SQL individuales ni
   asumir orden lexical o recursivo. No ejecutar las migraciones desde esta auditoría.
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
## Corrección posterior a un alta y asignación de plan

El alta pública siempre aprovisiona `FREE`. Una excepción controlada (por
ejemplo, el club de prueba inicial) se promueve después del alta, identificando
explícitamente al usuario o al club; nunca se infiere por fecha ni por ser el
último registro creado.

Después de aplicar las migraciones, asigne el plan comercial más alto al club
de prueba con credenciales administrativas:

```bash
npm run db:migrate
npm run club:set-plan -- --email=USUARIO_DE_PRUEBA --plan=ENTERPRISE
# Alternativa equivalente si se conoce el UUID:
npm run club:set-plan -- --club-id=UUID_DEL_CLUB --plan=ENTERPRISE
```

El comando bloquea el club, exige una cadena activa completa
`user -> person -> membership -> club`, cierra la suscripción vigente e inserta
la nueva dentro de una única transacción. Su salida JSON incluye todos los IDs
resueltos para conservar evidencia. Ante ambigüedad o datos incompletos no
modifica nada.
