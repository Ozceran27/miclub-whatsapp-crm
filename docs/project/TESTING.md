# Testing

## Escala de escritorio al 90 % — 2026-09-25

`npm run test -w @miclub/web` pasó (88/88), junto con `typecheck`, `build`,
`docs:check` y `git diff --check`. En Chrome headless con viewport de alto
608 px, la raíz conservó escala 1 hasta 1304 px de ancho y aplicó 0,9 desde
1305 px. A 1366 px el panel ocupó x=134…1292, el onboarding y=11…597 y no
hubo overflow horizontal. La conversión de coordenadas mantuvo alineado un
menú fijo con su disparador bajo `zoom: 0.9`.

Sigue pendiente la comparación autenticada en el Chrome del usuario con zoom
real 90 % y 100 % y el recorrido con zoom real 125 % y 200 %. No hubo cambios
de DB ni SQL.

## Escala general de escritorio — 2026-09-24

El frontend pasó 88/88 tests web, `typecheck` y `build`. `docs:check` pasó.
La auditoría dirigida con Chrome headless verificó la raíz a escala 1 en
390, 683, 1093 y 1159 px, y a escala 0,8 desde 1160 px. Con viewport
1366 × 608 px y scrollbar vertical, el panel ocupó x=195…1294 sin overflow
horizontal y el onboarding quedó dentro del viewport;
el diálogo alcanzó 579 px de alto frente a 608 px disponibles. Una prueba de
geometría comprobó que el menú posicionado desde `getBoundingClientRect()`
conserva la alineación tras convertir coordenadas con el factor 0,8.

La comparación autenticada de todas las rutas con el Chrome del usuario al
80 % y 100 %, y la comprobación con zoom real 125 % y 200 %, requieren una
sesión navegable; la auditoría headless verificó sus anchos CSS equivalentes,
pero no sustituye esos recorridos. El lint global mantiene errores previos.
No hubo cambios de DB ni SQL.

## Reversión de densidad visual — 2026-09-24

La capa `density.css`, su importación y los breakpoints experimentales de las
listas se retiraron. En navegador local, el shell recuperó márgenes
izquierda/derecha de 232/60 px a 1707 px, 12/48 px a 1366 px y 12/12 px a
1024, 390 y 360 px, sin desbordamiento horizontal en la vista de verificación.
El título volvió a 30 px en escritorio. La comparación visual autenticada con
zoom real de Chrome al 80 % y al 100 % sigue pendiente.

`npm run typecheck`, `npm run build`, `npm run test -w @miclub/web` (87/87),
`npm run docs:check` y `git diff --check` pasaron. El lint web global conserva
30 errores y 75 advertencias previos. El build mantiene el aviso del chunk
principal grande. No hubo cambios de DB ni SQL.

## Auditoría de Administración y área global — 2026-09-24

Corrección posterior: se comprobó el contenido de `.env` y `.env.codex.local`
sin mostrar secretos y se conectó `miclub_audit` con
`transaction_read_only=on`. El resumen completo respondió para el único club
disponible; hay cero sectores, actividades, inscripciones y movimientos, por lo
que no cubre datos financieros ni aislamiento de dos tenants. El shell ampliado
se midió en navegador: 1707 px → margen izquierdo 232 px y derecho 60 px;
1366 px → 12 y 48 px; 390 px → 12 px por lado, sin overflow horizontal.

- API: 468/468, web: 87/87 y shared: 9/9. Incluye regresiones de
  autorización, ocultación de rentabilidad sin `finance:read`, estado vacío
  genuino del resumen y paginación completa de sectores.
- `npm run typecheck`, `npm run build` y `npm run docs:check`: PASS. El build
  conserva el aviso de chunk principal grande (888,18 kB).
- Lint focalizado de los archivos modificados: 0 errores. El lint web global
  sigue fallando por deuda anterior (32 errores, 75 advertencias tras las
  correcciones de esta tarea; línea inicial 41/77).
- No hubo sesión autenticada para recorridos visuales completos ni un segundo
  club con datos para comprobar aislamiento entre tenants.

## Administración: sectores, trabajadores y actividades — 2026-09-23

Las regresiones de saldo por trabajador cubren importes firmados y separados por moneda, revisión pendiente, remuneraciones vencidas, saldos iniciales aprobados y diagnósticos incompletos. Las pruebas de saldos sectoriales rechazan sumas nominales entre monedas. Las suites API/web, typecheck y build se ejecutan antes de entregar cambios; la verificación visual de las tres pantallas requiere un club de prueba accesible en navegador. La auditoría del esquema y de datos reales requiere `AUDIT_DATABASE_URL` de solo lectura y verificación previa de `current_user` y `transaction_read_only`.

## Regresión de precios de actividades — 2026-09-22

`activitiesRepository.test.ts` cubre estado conservado en edición, alta sin precios cuando no hay inscripciones, fechas PostgreSQL `Date`, inserción histórica, fecha inicial duplicada, reactivación sin precio y cancelación auditable de vigencias futuras. `readOnlyRepository.test.ts` y `enrollmentsRepository.test.ts` comprueban que sólo los precios no cancelados se aplican; `activityPresentation.test.ts` comprueba fecha civil y frecuencia. La validación SQL real requiere las migraciones manuales y acceso de auditoría de sólo lectura.

## Precios y horarios — 2026-09-22

Revisar tests de contrato shared, rutas y repositorios API, editores web, manifiesto/checksum y SQL DBeaver. La verificación PostgreSQL real requiere backup y ejecución supervisada de la migración manual, seguida de pruebas con dos clubes y de UI en escritorio/móvil; ninguna escritura contra la base real se automatiza en este paquete.

En esta rama: API 444/444, web 83/83, shared 9/9 y manifiesto 16/16; `docs:check`, typecheck y build pasan. El lint focalizado de los componentes y repositorios nuevos pasa; el lint global sigue con deuda previa (incluido `shared/src/moneyNormalization.ts`). No hay `MIGRATION_GATE_DATABASE_URL`, `AUDIT_DATABASE_URL` ni `psql` disponibles en este entorno, por lo que instalación limpia, replay y pruebas PostgreSQL de dos tenants quedan pendientes de un entorno aislado. La revisión visual con sesión autenticada también queda pendiente.

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
