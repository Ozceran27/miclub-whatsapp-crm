# Checkpoint canónico pre-admin

**Vigente desde:** 2026-07-28  
**Estado:** referencia única antes de iniciar o desplegar el módulo administrativo.

## Invariantes aprobadas

- PostgreSQL es la única fuente autoritativa de producción: `POSTGRES_ENABLED=true`, `DATA_SOURCE=postgres` y `CRM_SOURCE=postgres`.
- Producción exige autenticación (`AUTH_ENABLED=true`), secreto de sesión de al menos 32 caracteres y URL pública HTTPS.
- El tenant se deriva de la identidad y membresía de la sesión. La API rechaza selección de `clubId` desde parámetros controlados por el cliente.
- Google Sheets se usa solo como importación temporal hacia PostgreSQL, nunca como fuente de consultas productivas.
- Mocks, fixtures y SQLite no tienen fallback productivo. Sus usos permitidos son pruebas, migración o auditoría histórica explícita.
- Los endpoints debug e import permanecen deshabilitados salvo una ventana operativa aprobada.
- Los contratos HTTP vigentes son los del [inventario reconciliado](api-route-inventory.md).

## Gate antes de trabajar en admin

1. Copiar `.env.example`, sustituir placeholders y confirmar las variables obligatorias.
2. Verificar manifiesto y aplicar migraciones versionadas; no ejecutar SQL suelto en producción.
3. Ejecutar typecheck, build y pruebas de API.
4. Validar login, logout, selección de club y aislamiento entre tenants con un entorno no productivo.
5. Confirmar que las flags de import/debug/bootstrap estén apagadas.
6. Realizar backup y acordar rollback antes de cambios de schema o datos.

Comandos base:

```bash
npm run db:migrations:check
npm run db:migrate
npm run typecheck
npm run build
npm run test -w @miclub/api
```

Los comandos que dependen de PostgreSQL o Google Sheets deben ejecutarse solo contra el entorno aprobado y nunca con credenciales versionadas.

## Runbooks especializados (sin duplicación)

Este checkpoint fija invariantes y gates; los pasos detallados viven únicamente aquí:

- [Identidad, autorización y tenant](auth-tenant-remediation-runbook.md).
- [Corte, validación y retiro de legacy en PostgreSQL](postgres-cutover-runbook.md).
- [Importación controlada Google Sheets → PostgreSQL](google-sheets-postgres-migration.md).
- [Configuración y recuperación del arranque](bootstrap-config-current.md).
- [Diagnósticos SQL asistidos con DBeaver](dbeaver/README.md).

## Evidencia de cierre

La PR que habilite admin debe registrar: commit desplegado, entorno, resultado de cada comando del gate, migraciones aplicadas, prueba de aislamiento tenant, estado final de flags y enlace al backup/rollback en el sistema operativo correspondiente (sin secretos en Git).

Los checkpoints previos y explicaciones de fallbacks están archivados en [`history/`](history/README.md); están fechados y expresamente prohibidos como guía para despliegues nuevos.
