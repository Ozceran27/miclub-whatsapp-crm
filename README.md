# miClub WhatsApp CRM

Punto de entrada operativo para miClub Gestión: API Express/TypeScript, web React/Vite y **PostgreSQL como única fuente autoritativa de producción**.

## Contrato de producción

- `DATA_SOURCE=postgres` y `CRM_SOURCE=postgres`; PostgreSQL conserva datos operativos, CRM, identidad, membresías y auditoría.
- La autenticación es obligatoria (`AUTH_ENABLED=true`). El arranque productivo rechaza una sesión débil, una URL pública sin HTTPS o fuentes legacy.
- Toda operación de negocio obtiene `clubId` de la sesión y membresía autenticadas. No se acepta un tenant enviado por query, body o headers del cliente.
- Google Sheets no es una fuente de lectura productiva: se admite únicamente como entrada de importaciones explícitas, auditadas y acotadas.
- No existe fallback productivo a mocks, fixtures, Google Sheets ni SQLite. Los artefactos legacy solo sirven para pruebas, migración o consulta histórica.

El estado y los controles previos al siguiente módulo administrativo están en el [checkpoint canónico](docs/checkpoint-pre-admin.md). La [arquitectura actual](docs/architecture-current.md) y el [inventario de rutas](docs/api-route-inventory.md) complementan esa referencia.

## Inicio local

```bash
npm install
cp .env.example .env
npm run db:migrations:check
npm run db:migrate
npm run dev
```

Configure en `.env` una conexión PostgreSQL, un `SESSION_SECRET` local de al menos 32 caracteres y los valores marcados como obligatorios en `.env.example`. La API usa `http://localhost:4000` y Vite `http://localhost:5173`.

## Validación y ejecución

```bash
npm run typecheck
npm run build
npm run test -w @miclub/api
npm run start
```

`npm run start` sirve también `apps/web/dist`. Para un entorno desplegado use `NODE_ENV=production`, una `PUBLIC_APP_URL` HTTPS y autenticación habilitada; el validador de arranque falla de forma cerrada si falta esa configuración.

## Importación excepcional desde Google Sheets

Sheets se habilita solo durante una ventana controlada. El flujo preferido es:

```bash
npm run import:sheets:dry
npm run import:sheets
npm run audit:postgres
```

Consulte el [runbook de importación Sheets → PostgreSQL](docs/google-sheets-postgres-migration.md). Los endpoints de importación requieren además `IMPORT_ENDPOINTS_ENABLED=true`, membresía activa y permiso `imports:run`; deben volver a apagarse al cerrar la ventana.

## Documentación operativa

- [Checkpoint canónico pre-admin](docs/checkpoint-pre-admin.md)
- [Arquitectura actual](docs/architecture-current.md)
- [Inventario de endpoints](docs/api-route-inventory.md)
- [Runbook de identidad y tenant](docs/auth-tenant-remediation-runbook.md)
- [Runbook de corte PostgreSQL](docs/postgres-cutover-runbook.md)
- [Archivo histórico (no usar para despliegues nuevos)](docs/history/README.md)

## WhatsApp

La aplicación prepara enlaces `wa.me`; una persona revisa y envía cada mensaje manualmente desde WhatsApp Web. No automatiza el envío ni controla WhatsApp Web.
