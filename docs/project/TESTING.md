# Testing

## Regresión de alta de actividades — 2026-09-21

- Auditoría PostgreSQL real exclusivamente read-only: `current_user=miclub_audit`
  y `transaction_read_only=on`. Se confirmó que la base tiene
  `activities_updated_by_fkey → people(id)`, la responsabilidad canónica por
  empleado y el trigger canónico. No se consultaron datos personales ni se
  ejecutaron escrituras.
- API: 441/441 PASS. Incluye regresiones para FK de actor a `people`, FK a
  `users`, schema desconocido fail-closed, atomicidad actividad+término,
  aislamiento tenant y logging seguro de metadatos PostgreSQL.
- Web: 78/78 PASS; shared: 7/7 PASS; `npm run docs:check`: PASS.
- `npm run typecheck` y `npm run build`: PASS en los tres workspaces. Vite
  conserva la advertencia conocida por el chunk principal de 864,65 kB
  (242,10 kB gzip).
- Lint focalizado de producción: 0 errores y 12 advertencias históricas en el
  parseo Express de `activityMutationRoutes.ts`. El gate global continúa en
  FAIL por deuda previa: 193 errores y 583 advertencias. `npm run deadcode`
  también continúa en FAIL por candidatos históricos; no se eliminaron
  contratos o entrypoints fuera del alcance.
- Sin cambios de schema, SQL nuevo ni ejecución manual en DBeaver. La corrección
  adapta el runtime a ambas variantes históricas ya instaladas.

## Auditoría integral posterior a Administración — 2026-09-20

- API: 429/429 PASS; web: 75/75 PASS; shared: 7/7 PASS.
- Typecheck y build: PASS. Vite conserva la advertencia conocida por el chunk
  principal, actualmente 860,19 kB (240,76 kB gzip).
- Lint focalizado de los archivos funcionales modificados: PASS; el gate global
  continúa afectado por la deuda histórica: 196 errores y 578 advertencias.
- `npm run deadcode`: FAIL con 2 archivos, 116 exports, 93 tipos exportados y
  7 exports duplicados candidatos, además de binarios/configuración pendientes.
  El inventario no se eliminó automáticamente porque incluye contratos y
  entrypoints que requieren revisión funcional por dominio.
- Navegador local: portada, login y registro inspeccionados en escritorio y móvil.
  Se reprodujo y corrigió el enlace móvil de Registro superpuesto por la tarjeta.
  Una recarga limpia confirmó el árbol de sesión operativo; los errores de
  contexto observados durante HMR no reaparecieron tras la recarga completa.
- Regresiones nuevas: conversión/fallo cerrado de rentabilidad multimoneda,
  exclusión de actividades archivadas, preservación del responsable al editar,
  error visible dentro del modal y reserva de foto durante invitaciones.
- Sin escrituras en PostgreSQL, ejecución de SQL real ni cambios de esquema.

## Cierre de organización y auditoría — 2026-09-19

- `npm run docs:check`: PASS.
- API: 417/417 PASS; web: 71/71 PASS; shared: 7/7 PASS.
- Manifiesto de migraciones: 15/15 PASS, incluidos checksums inmutables.
- Frontera Google Sheets runtime: 1/1 PASS.
- `npm run typecheck` y `npm run build`: PASS. Vite mantiene la advertencia
  conocida por el chunk principal de 834,86 kB.
- `npm run lint`: FAIL con 205 errores y 577 advertencias por la deuda global ya
  inventariada. El nuevo verificador documental y la regresión agregada pasan su
  lint focalizado.
- `npm run deadcode`: FAIL por candidatos y exports históricos pendientes; no se
  eliminaron contratos o entrypoints sólo por aparecer en ese inventario.
- `git diff --check`: PASS; los avisos CRLF/LF corresponden a la configuración
  local de fin de línea.
- Sin escritura en PostgreSQL, ejecución de SQL real ni nuevo E2E de navegador.

## Integridad documental — 2026-09-19

- `npm run docs:check`: valida enlaces Markdown locales en todo `docs/` y falla
  ante destinos inexistentes. Se ejecuta también desde `npm run check` y CI.
- El Manual Oficial regenerado fue inspeccionado como PDF A4 de 10 páginas; se
  revisaron páginas inicial, intermedia y final sin recortes ni superposiciones.
- El control de enlaces no valida afirmaciones de negocio ni URLs externas; esas
  revisiones continúan dependiendo del código, tests y procedimientos del dominio.

## Auditoría local — 2026-09-17

- API: `npm run test -w @miclub/api`: 417 PASS.
- Web: `npm run test -w @miclub/web`: 71 PASS tras retirar un test que
  inspeccionaba componentes sin consumidores y agregar una regresión de
  referencias del borrador.
- Shared: `npm run test -w @miclub/shared`: 7 PASS.
- Manifiesto: `npm run db:migrations:check`: 15 PASS.
- `npm run typecheck` y `npm run build`: PASS. Vite informa chunk principal
  de 834,86 kB sin dividir.
- `npm run lint`: FAIL, 205 errores y 577 advertencias globales. El lint
  focalizado del nuevo helper y los cambios de fotos/diálogo pasó. No se
  deshabilitaron reglas. `npm run deadcode` también FAIL; su inventario se usó
  para retirar copias JS y dos componentes sin consumidores, no para borrar
  indiscriminadamente contratos o archivos detectados como candidatos.
- DB: sólo metadatos con rol `miclub_audit` y `transaction_read_only=on`.
  No hubo E2E navegador ni integración nueva en PostgreSQL aislado en esta
  pasada. Los resultados anteriores de integración no certifican el checkout
  actual ni el entorno real.

## Verificación del circuito — 2026-09-11

- Suite de `*.test.ts`/`*.test.tsx` de api/src, web/src y shared/src con
  `node --import tsx --test --test-concurrency=1`: **493 PASS, 0 FAIL**.
- `financialCircuitRegression.test.ts` y `openingBalancesRegression.test.ts`
  ejecutados secuencialmente en PostgreSQL 18 aislado: **19 PASS, 0 FAIL**.
- `npm run typecheck`: PASS en los tres workspaces.
- `npm run build`: PASS; Vite conserva advertencia de tamaño de bundle.
- `npm run lint`: **280 errores, 577 advertencias** en el repositorio. Este gate
  no está aprobado y no se certifica una release integral libre de deuda técnica.
- `git diff --check`: sin errores de whitespace.
- Comprobación visual local con cuenta descartable: Inicio y Tesorería cargan
  las tarjetas, liquidaciones, herramientas y gráficos. Se reprodujo el fallo
  de GROUP BY y se verificó que Tesorería carga después de la corrección.

La integración prueba recuperación de estructura parcial sin ledger, repetición
del script manual, rechazo de deriva estructural, respuesta 503 por schema faltante,
deuda por sobrepago, devoluciones corregidas/anuladas con cuotas sincronizadas,
concurrencia e idempotencia, compensación de deuda inicial, pagos de proveedores,
aislamiento A/B, acceso a Migración según plan y override, importación XLSX v4 con
saldo inicial DRAFT, y todos los recursos consumidos por Tesorería.

Las pruebas crean y eliminan únicamente bases descartables después de verificar
`miclub.test_cluster=release_candidate_isolated`. No se ejecutó SQL modificador
contra la base real. La instalación real se explica en
[la guía DBeaver](../dbeaver/GUIA-CIRCUITO-FINANCIERO.md).

## DEC-017 — bloque de cálculo mensual y proyecciones (2026-09-09)

- Suite local: 493 tests, 488 aprobados, 5 fallidos. Los cinco coinciden con
  los anteriores: frontera runtime SQLite/Sheets en Windows, diagnóstico de
  backfill, último Director, sr-only y scroll de catálogos visuales.
- 18 regresiones nuevas de cálculo aprobadas: ejemplos VARIABLE/FIXED, deuda
  12000, receptor histórico, devolución FIXED, límites, prorrateo/centavos,
  distribución única, compensación por persona/moneda, fechas/IDs inválidos,
  timezone, proyectado neto, cuotas/obligaciones repetidas y FX faltante.
- Typecheck y build aprobados; persiste advertencia de bundle web >500 kB.
- Lint global: 281 errores preexistentes; la primera corrida sumó 18 warnings
  por promesas de los tests nuevos, corregidos con `void test`. Los archivos
  funcionales nuevos/modificados no introdujeron errores de lint.
- Sin cambios SQL ni pruebas de DB/UI en este bloque. Estas pruebas unitarias
  no certifican RLS, concurrencia, persistencia ni circuito integrado.

## Verificación de esta etapa — 2026-09-09

- Regresiones focalizadas de capacidades, XLSX y onboarding: 66 PASS.
- Suite local completa: 475 tests, 470 PASS, 5 FAIL. Persisten los fallos RC:
  startup productivo Windows, comparación documental de activity terms,
  fixture de último Director y dos assertions visuales sr-only/iconos.
- Integración `openingBalancesRegression.test.ts`: 7 PASS, 0 FAIL en PostgreSQL
  18 aislado marcado, incluyendo registro/login, onboarding CLUB y replay,
  navegación/descarga para FREE/SOCIAL/COMPLEX/CLUB, override/expiración,
  instalación/replay del SQL manual de categorías, dry-run/apply de actividad,
  sector e inscripción, referencias cambiadas y rechazo tenant A/B sin escrituras.
- Manifiesto: 15 PASS. Migraciones históricas intactas; delta nuevo registrado.
- Typecheck y build PASS en los tres workspaces. Bundle web ~813 kB: advertencia
  de tamaño pendiente. Lint global FAIL: 281 errores y 586 warnings en la ejecución
  de esta etapa; no se deshabilitaron reglas.
- Plantilla XLSX v3 renderizada y validada por el lector runtime. No se ejecutó
  E2E visual de navegador ni SQL sobre la base real.

Comandos reales: `npm run typecheck`, `npm run build`, `npm run lint`,
`npm run db:migrations:check`; tests con `node --import tsx --test`.
En Windows, tsx necesitó ejecución fuera del sandbox por `uv_os_get_passwd ENOMEM`.

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
# Regresión de saldos RC — 2026-09-08

Prueba nueva: `apps/api/integration/openingBalancesRegression.test.ts`.
Requiere `MIGRATION_GATE_DATABASE_URL` explícita y un servidor aislado con
`miclub.test_cluster=release_candidate_isolated`. Se verifica la marca antes de
crear o borrar la base temporal. Ejecución desde la raíz:

```text
node --import tsx --test apps/api/integration/openingBalancesRegression.test.ts
```

El resultado verificado fue 5 PASS/0 FAIL en PostgreSQL 18 local aislado. Abarca
HTTP y SQL, no inspección visual. Los gates de registro y aislamiento sólo limpian
una base después de haberla creado; rechazar un destino no habilita su limpieza.
El gate de instalación devuelve fallo si no se aporta un backup para probar restore.
Estado integral y pendientes: [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md).
