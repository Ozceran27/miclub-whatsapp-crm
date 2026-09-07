# Testing

## Evidencia del bootstrap — 2026-09-07

Commit 42b81a363c4eee04dd4d3bbaceaff116d7c26891. Resultados históricos de esta auditoría; la sincronización documental no los convierte en certificación nueva.

| Check | Resultado |
| --- | --- |
| npm run typecheck | Aprobado en API/web/shared |
| npm run build | Aprobado; chunk web ~812 kB, ~230 kB gzip |
| npm run lint | 282 errores, 578 warnings |
| Suite local API/web/shared | 465 tests: 458 pass, 7 fail |
| Inventario/checksums/grafo manifest | Tests correspondientes aprobados |
| Frontera Google Sheets | Aprobada dentro de suite local |
| npm run deadcode | Falló: 15 archivos candidatos, 116 exports y 6 aliases duplicados, entre otros |
| Integraciones DB / E2E navegador | No ejecutados |

Fallos: startup loader Windows (path en lugar de file URL); comparación CRLF en activityTermsMigration; SQL tenant-deletion incompleto; comparación CRLF en checkpoint post-admin; fixture Director versus DIRECTOR; dos regex de markup anterior en uiRegression.

Normalizar LF confirmó equivalencia del checkpoint y orden diagnóstico/backfill. Tenant-deletion sigue divergente: 91/94 migraciones. Tests visuales estáticos no prueban una regresión visual por sí solos. El test “último Director” fallido es fixture de lectura; no equivale a probar concurrencia de mutaciones.

## Comandos disponibles

Raíz: npm run typecheck, build, lint, deadcode, check, check:no-google-sheets-runtime y db:migrations:check. check ejecuta lint de workspaces, deadcode, typecheck, build y tests; no confundirlo con lint raíz (eslint .), que también alcanza archivos históricos/configuración.

Workspaces: npm run test -w @miclub/api, @miclub/web o @miclub/shared. Cada uno dispone de build/typecheck/lint. API ofrece test:integration:empty-db.

El script test de API usa NODE_ENV=test en sintaxis POSIX y no funciona directamente en cmd Windows. El bootstrap ejecutó el equivalente PowerShell, con URLs locales cerradas y sin integraciones:

~~~powershell
$env:NODE_ENV='test'
$env:DATABASE_URL='postgres://unused:unused@127.0.0.1:1/unused'
$env:ADMIN_DATABASE_URL='postgres://unused:unused@127.0.0.1:1/unused'
$env:MICLUB_TEST_DATABASE_URL=''
$env:MIGRATION_GATE_DATABASE_URL=''
node --import tsx --test --test-concurrency=1 apps/api/src/**/*.test.ts apps/web/src/**/*.test.ts packages/shared/src/**/*.test.ts
~~~

Muchas pruebas son assertions sobre código/SQL o adaptadores mock. El archivo clubProvisioningService.integration.test.ts usa harness local; no prueba PostgreSQL real. El sandbox Windows produjo uv_os_get_passwd ENOMEM; se reintentó fuera del sandbox con autorización y las mismas restricciones DB.

## Integraciones y seguridad

- db:migrations:integration: instala y restaura en bases descartables; requiere MIGRATION_GATE_DATABASE_URL.
- db:tenant-isolation:integration y db:public-registration:integration: bases descartables y rutas reales.
- test:integration:empty-db: requiere MICLUB_TEST_DATABASE_URL con nombre test; rechaza prod/production/miclub_gestion y omite si falta.
- Algunas suites aprovisionan roles a nivel cluster. Usar instancia aislada, no sólo un nombre de DB distinto en el cluster real.
- db:migrate, audit:postgres, db:readiness-report, bootstrap:director y scripts administrativos no son checks locales puros; inspeccionar destino antes de ejecutarlos.

## Gates pendientes

Instalación vacía autocontenida; ledger/schema/grants; zero-tenant startup; registro/rollback; auth/login/logout/revocación; operaciones válidas bajo miclub_runtime; rechazos A→B en lectura/escritura/borrado y referencias; onboarding final idempotente; sectores; workers/instructors; importación ANULADO; liquidaciones SQL conectadas al flujo.

VARIABLE: ingreso 100000, club 40%, pagado 20000 → 40000.
FIXED mensual: ingreso 500000, fee 150000, pagado 30000 → 320000.
Los tests del calculador TS no certifican las vistas runtime FIXED.

E2E objetivo: Register → Login → Onboarding → Saldos/Sectores/Workers/Activity/Plan → Finish → Dashboard → XLSX dry-run/apply → Economy/Admin/CRM.

No ejecutar contra DB real sin autorización. Readiness exige evidencia del entorno, commit y fecha; los gates rojos no se resuelven cambiando documentación.
