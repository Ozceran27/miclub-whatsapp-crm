# Testing

## Scripts raíz observados

```bash
npm run dev
npm run build
npm run typecheck
npm run start
npm run check
npm run check:no-google-sheets-runtime
npm run audit:postgres
npm run db:migrate
npm run db:migrations:check
npm run db:migrations:integration
npm run db:tenant-isolation:integration
npm run db:public-registration:integration
npm run db:readiness-report
npm run deadcode
npm run lint
```

## API

```bash
npm run test -w @miclub/api
npm run test:integration:empty-db -w @miclub/api
```

## Web

```bash
npm run test -w @miclub/web
npm run build -w @miclub/web
npm run typecheck -w @miclub/web
```

## Shared

```bash
npm run test -w @miclub/shared
npm run build -w @miclub/shared
npm run typecheck -w @miclub/shared
```

## Gate recomendado

```bash
npm run check
npm run check:no-google-sheets-runtime
npm run db:migrations:check
```

Integration DB sólo contra entorno aislado.

## Gates previos a reset

1. manifest/ledger sin drift;
2. instalación desde schema limpio;
3. public registration;
4. tenant isolation;
5. zero-tenant startup;
6. auth/login/logout;
7. onboarding;
8. system sectors;
9. worker/instructor;
10. activities;
11. settlement VARIABLE/FIXED;
12. XLSX dry-run/apply;
13. dashboards vacíos;
14. no Google Sheets runtime.

## Casos de settlement obligatorios

VARIABLE: 100000, club 40%, responsable 60%, paid 20000 → 40000.

FIXED: 500000, fee 150000, paid 30000 → 320000.

## E2E limpio objetivo

Register → Club → Login → Onboarding → Saldos → Sectores → Worker/Instructor → Activity → Finish → Dashboard → XLSX → Dry-run → Apply → Verify Economy/Admin/CRM.

## Seguridad

Probar duplicate email, password inválido, sesión revocada, tenant A/B, XLSX inválido, referencias faltantes e import cross-tenant.

## DB real

Nunca ejecutar tests destructivos contra la DB real por defecto.
