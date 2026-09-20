# Current State

## Correcciones operativas posteriores al despliegue — 2026-09-19

La lista de movimientos obtiene `activity_id` desde `miclub.movements`, porque la
vista histórica `v_movements_enriched` no expone esa columna. Esto elimina el
`42703` observado en `/api/movimientos` sin modificar el esquema real.

El catálogo y las mutaciones de instructores usan `instructors.status` con los
valores reales de `miclub.entity_status` (`activa`, `suspendida`, `cancelada`). El
runtime ya no consulta ni intenta escribir una columna `instructors.is_active`
que no existe en el esquema desplegado.

Los accesos rápidos “Gestionar Sectores”, “Gestionar Trabajadores” y “Gestionar
Actividades” abren los formularios permanentes de creación según los permisos de
la membresía. Ya no se resuelven como funcionalidades futuras.

Administración y Tesorería continúan siendo sectores de sistema persistidos para
relaciones operativas y financieras, pero no generan pestañas sectoriales
duplicadas: sus superficies son los módulos núcleo Administración y Economía
Club, respectivamente. Áreas Comunes y los sectores configurables sí se publican
como pestañas dinámicas.

## Configuración operativa desde Administración — 2026-09-19

Administración es ahora la superficie permanente para crear, consultar, editar y
archivar sectores, trabajadores/instructores y actividades después del onboarding.
Los formularios escriben directamente con UUID, tenant derivado de sesión,
permisos backend y control de concurrencia donde corresponde. La navegación
sectorial se invalida al crear o cambiar el ciclo de vida de un sector.

El circuito financiero incorpora términos históricos de remuneración, obligaciones
en borrador/aprobadas, ajustes firmados de liquidación, pagos parciales netos por
persona y moneda, compensación FIFO entre actividades y remuneraciones, grupos de
pago anulables y reemplazo auditado de saldos iniciales. Los fijos DAILY, WEEKLY,
MONTHLY y YEARLY generan vencimientos completos; no existe prorrateo entre meses.
Economía conserva el resumen de sólo lectura y las mutaciones quedan en
Administración.

La migración versionada es
`202609190001_administration_configuration.sql`. La base real no fue modificada:
requiere ejecutar manualmente y validar
`docs/dbeaver/2026-09-19-administracion-operativa.sql`. Hasta completar ese gate,
el runtime financiero informa que falta el esquema en lugar de inventar saldos.
Las secciones históricas inferiores que describen UI sólo lectura, invitaciones sin
bandeja o prorrateo FIXED quedan sustituidas por este estado y por el código actual.

## Organización documental y control de referencias — 2026-09-19

`docs/` quedó organizado por propósito: proyecto, arquitectura, dominios,
importación, operaciones, referencia, SQL manual, manual de usuario e historia.
Los documentos históricos, decisiones sustituidas, planes cerrados y auditorías
anteriores están separados de las fuentes vigentes. Los diagnósticos y
correcciones SQL sueltas quedaron dentro de `docs/dbeaver/`, sin alterar su
contenido ejecutable. El diagnóstico histórico de liquidaciones permanece en la
raíz de `docs/` porque su ruta integra el checksum de una migración publicada.

Todas las referencias conocidas del repositorio fueron ajustadas a las rutas
nuevas. `npm run docs:check` valida enlaces Markdown locales y forma parte de
`npm run check` y CI. El manual oficial fue sincronizado en Markdown, HTML y PDF;
el PDF resultante tiene 10 páginas A4 y fue revisado visualmente en páginas
inicial, intermedia y final.

Esta reorganización no cambia el modelo de datos ni ejecuta SQL. Los scripts para
una base real siguen requiriendo ejecución manual y validada mediante DBeaver.
El estado funcional de la auditoría del 17/09 y sus gates pendientes continúa
vigente.

## Auditoría de flujo y limpieza — 2026-09-17

Revisión del checkout `main` posterior a las entregas financieras: registro,
sesión, onboarding, configuración de sectores, trabajadores y actividades,
contratos compartidos, plantilla XLSX y organización del árbol. La suite local
verifica reglas y rutas con mocks; no sustituye un recorrido visual ni una
instalación PostgreSQL descartable desde cero. No se modificó la base real.

Corregido en esta pasada: el editor de actividad conserva la moneda y frecuencia
del término FIXED al reabrirlo; lista y detalle muestran esos valores en vez de
asumir ARS/mensual. El onboarding reconoce la finalización del servidor antes de
refrescar menú/panel, de modo que una falla secundaria de lectura no invita a
reenviar una creación exitosa. Cancelar la edición de un trabajador conserva su
foto original; las fotos temporales nuevas se descartan al cancelar. El editor
bloquea la eliminación u omisión de sectores e instructores usados por
actividades del borrador. El texto de arranque distingue liquidez de deudas
históricas. Se retiraron cuatro componentes
sin consumidores y copias JS generadas previamente archivadas.

La hoja XLSX `SALDOS_INICIALES` v4 representa obligaciones históricas de personas,
no el efectivo/banco del paso de saldos del onboarding. Se mantienen plantilla y
pipeline para una decisión de producto posterior; ver IMPORT_SYSTEM. Un
movimiento importado no crea automáticamente esa obligación explícita.

La conexión `AUDIT_DATABASE_URL` respondió como `miclub_audit` con
`transaction_read_only=on`. Una inspección sólo de metadatos encontró
`clubs`, `club_onboarding`, `activity_terms`, `opening_balance_batches`,
`activity_settlements`, `finance_startups`, `initial_obligations` y tablas de
revisión/pagos. También encontró las columnas comprobadas de términos, revisión
y onboarding. Esto no verifica datos, grants, ledger, paridad ni una instalación
completa; no se realizó ninguna escritura SQL.

Pendiente antes de una prueba real certificada: SQL manual aplicado y validado en
el entorno de prueba, recorrido navegador completo con cuenta y club nuevos,
persistencia del borrador de onboarding al recargar, comprobación visual de las
referencias en el editor, y cierre de lint/deadcode.
Las secciones históricas siguientes documentan entregas anteriores y pueden
contener cifras de tests o bugs ya superados; usar esta sección y el código
actual para el estado de esta auditoría.

## Circuito financiero DEC-017 — entrega 2026-09-11

El runtime /api/finance conecta cuentas, movimientos, pagos y aplicaciones a cuotas
en transacciones tenant. Incluye historial de correcciones, devoluciones parciales
y su edición/anulación, liquidaciones mensuales persistidas, versiones aprobadas,
pagos parciales, cierre independiente y compensaciones FIFO. Corregir ingresos
conserva pagos realizados y genera deuda cuando existe sobrepago.

Economía contiene las herramientas; Inicio, Administración y CRM consumen su
resumen compartido. Las proyecciones incompletas conservan null y explican sus
supuestos. Se respetan fecha de caja, zona del club, corte y cotizaciones persistidas.
Las escrituras legacy de movimientos remiten al flujo coordinado.

XLSX v4 incluye cuentas, identificadores de origen y SALDOS_INICIALES. Los saldos
importados quedan DRAFT hasta conciliación explícita. Hay pagos parciales de saldos
iniciales de empleados/proveedores y compensación de deudas del responsable.
Importar historia anterior al corte exige revisar el arranque, sin alterar caja.

Corregidos: recuperación SQL de columnas existentes; columna review_state ausente;
restricción de hojas de importación; GROUP BY del desglose anual; diferencia de reloj
entre menú y autorización de Migración. Una estructura financiera incompleta ahora
se informa con 503 y una instrucción de actualización, sin saldos ficticios.

**La instalación real requiere ejecución manual.** La [guía SQL](../dbeaver/GUIA-CIRCUITO-FINANCIERO.md)
explica el orden. El script acumulativo incluye 002 y 003; no ejecutarlas aparte.
No se modificó la base real. El rol de auditoría sólo permitió inspeccionar schema,
no el ledger. Ver TESTING para resultados en PostgreSQL aislado y controles locales.

La deuda general de lint y las lecturas legacy señaladas en las auditorías siguen
visibles. No se certifica ausencia absoluta de errores en toda la app ni el despliegue
real. Las secciones siguientes son antecedentes y no sustituyen este estado.

## Actualización operativa — 2026-09-09

Esta sección prevalece sobre los hallazgos históricos inferiores para los cambios
que enumera; no certifica una release integral ni el despliegue real.

- Corregido acceso a Migración por plan: navegación y autorización comparten
  resolución efectiva. Menú actualizado al completar onboarding y cambiar ruta;
  endpoint sin caché HTTP. RBAC y overrides siguen aplicándose.
- XLSX v3 agrega Actividad en AA de ADMINISTRACIÓN y persiste activity_id; deriva
  sector si falta, bloquea discordancias y referencias ambiguas/ajenas al club.
  Concepto no infiere relaciones. Plantilla v2 exige conversión manual a v3.
- Validador compatible con XML estándar prefijado y celdas vacías; corregida
  consulta de instructores. Hash del dry-run incluye referencias resueltas.
  retry/reversal se rechazan, sin prometer reversión implementada.
- Catálogo incorpora Reservas/Señas como ingresos operativos. Economía deriva
  su lista de ingresos operativos del catálogo shared. Nueva migración aditiva,
  con SQL manual [DBeaver](../dbeaver/2026-09-09-reservas-senas.sql); no ejecutado
  sobre la base real. No hay nuevas tablas ni columnas.
- Reglas financieras confirmadas en BUSINESS_RULES y DECISIONS. El test de FIXED
  conserva -25000 para 60000 de ingreso menos 85000 de fijo; no certifica arrastre
  ni cierre operativo. Esas integraciones siguen pendientes.

Resultados de esta etapa: ver TESTING. Próxima definición: devoluciones,
cierre/ajustes, cambios de responsable, proyecciones y conciliación de importación
con saldos. La ampliación restante del catálogo y la corrección integral del
circuito de liquidaciones continúan abiertas.

## Checkpoint auditado — 2026-09-07

Bootstrap aprobado, basado en código, migraciones y tests locales. No se conectó a PostgreSQL real. Describe el repositorio, no certifica el entorno desplegado.

| Elemento | Evidencia |
| --- | --- |
| Branch / commit | main / 42b81a363c4eee04dd4d3bbaceaff116d7c26891 |
| Working tree al auditar | Limpio |
| Migraciones | 94 entradas; orden en apps/api/src/scripts/migrationManifest.ts |
| Última migración | 202609050003_classify_cmv_as_non_operational.sql |
| Typecheck / build | Aprobados en los tres workspaces |
| Tests locales | 465: 458 aprobados, 7 fallidos |
| Lint raíz | 282 errores, 578 warnings |
| Deadcode | Falló; candidatos pendientes de revisión |
| Integraciones DB / E2E limpio | No ejecutados |
| Ledger/schema desplegado | No inspeccionados |
| READY FOR DATABASE RESET | NO |
| READY FOR CLEAN E2E | NO: instalación y bugs pendientes |

Los resultados corresponden al bootstrap; no son checks reejecutados por esta edición documental. Ver [TESTING.md](TESTING.md).

## Implementación actual

- Monorepo npm: Express/TypeScript en apps/api, React/Vite en apps/web, contratos en packages/shared. Router y cache web propios.
- PostgreSQL operacional; Google Sheets y SQLite no son fallback runtime.
- Registro condicionado por auth y PUBLIC_REGISTRATION_ENABLED=true. Provisioning transaccional: club, FREE, onboarding NOT_STARTED, roles, User, Person, membership/employee Director, sectores system, medios de pago y categorías tenant. No inicia sesión automáticamente.
- Sesión firmada, revalidación de membership, permisos backend y revocación al logout. Tenant derivado de identidad autenticada.
- Onboarding: Bienvenida, Saldos, Sectores, Trabajadores, Actividades, Plan/Migración y Finalización. Draft v2 temporal; F5 reinicia. Finalización persistente, atómica e idempotente.
- Workers con remuneración fija opcional, frecuencia y moneda; Instructor es relación separada con Person. Administración invita identidades existentes; el draft actual las rechaza.
- Actividades con términos históricos VARIABLE/FIXED; sectores dinámicos, templates globales y capacidad ENROLLMENTS/INCOME.
- Movimientos, inscripciones, lecturas de pagos/deudas, Inicio, Economía, Administración y CRM presentes, con contratos canónicos y de compatibilidad.
- XLSX efectivo v2: Modelo_Import_miClub.xlsx; ADMINISTRACIÓN A:Z e INSCRIPCIONES A:U; dry-run y apply.
- FREE/SOCIAL/COMPLEX/CLUB. Onboarding activa cualquiera sin cobro, incluso en BILLING_MODE=live; origen pre_billing_onboarding.
- Cuentas/saldos iniciales y valoración multimoneda con cotizaciones y trazabilidad PostgreSQL.

## Hallazgos abiertos

No son reglas aceptadas. A = documentación desactualizada; B = bug; C = ambiguo; D = legacy.

| ID | Clase | Hallazgo / evidencia |
| --- | --- | --- |
| B01 | B | Instalación vacía no autocontenida: objetos necesarios dependen de schema previo o DDL manual. Ver DATA_MODEL. |
| B02 | B | Activities, movements, enrollments y CRM acceden a tablas protegidas sin contexto transaccional RLS. Ver TENANCY_AND_RBAC. |
| B03 | B | Vista/lecturas FIXED usan monthly_fixed_fee; escrituras usan fixed_club_fee, frecuencia y moneda. |
| C01 | B/C | No se encontró creación runtime de activity_settlements; calculador TS sólo consumido por tests; vistas requieren liquidaciones COMPLETADO existentes. |
| B04 | B | XLSX admite ANULADO pero workbook.ts lo transforma en COMPLETADO. |
| B05 | B | readOnlyRepository.ts devuelve true as is_system para todos los sectores. |
| B06 | B | Ruta worker invitations no revalida revocación de sesión como /auth/me. |
| C02 | B/C | No se encontró entrega del token; aceptar invitación/cambiar rol no sincroniza Instructor como alta nueva. |
| B07 | A/B | SQL manual tenant-deletion conserva 91 entradas; faltan las tres migraciones del 5 de septiembre. No corregido por esta sincronización. |
| C03 | C | Decidir persistencia intermedia de onboarding: draft temporal versus promesa documental anterior de progreso/F5. |
| C04 | C | projectedBalance suma saldo positivo adeudado al responsable: aclarar semántica/signo. |
| C05 | C/D | economyDomain conserva clasificación duplicada; fallback SALARIOS diverge del catálogo. |

Otros riesgos: PGSSL desactiva verificación de certificado; trust proxy=true requiere frontera de proxy definida; fotos usan directorio temporal por defecto. No se inspeccionó configuración real.

## Historia relevante

- 42b81a3: agrega AGENTS y docs/project.
- 6f84fbd: migración CMV compatible con categorías sin code.
- ff0a88b: CMV no operativo.
- d686d71: corrige estado financiero de opening balances.
- 7f38030: selección de plan sin cobro en onboarding.

## Próximo milestone

1. Completar instalación reproducible y probar operaciones válidas bajo miclub_runtime en PostgreSQL descartable.
2. Corregir bugs RLS, liquidaciones, importación, sectores e invitaciones; resolver C01–C05 explícitamente.
3. Reparar gates locales y certificar registro, aislamiento A/B y First Clean Club Journey.
4. Sólo después preparar readiness de reset real con backup/restauración, ledger y SQL manual revisado.

La existencia de scripts no prueba ejecución. Rige docs/operations/pre-reset-readiness.md; el reset real no es el próximo paso automático.
# Verificación RC — 2026-09-08

Trabajo sin commit sobre `bec17e642b3a6f151aaab62a51b179926a7da5bb`.
La implementación del plan RC está **parcial**, no certificada. El inventario
de tareas y límites se mantiene en [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md).
La corrección del error de saldos fue reproducida y validada en PostgreSQL aislado;
requiere SQL manual en la base real, detallado en [ONBOARDING.md](ONBOARDING.md).
No se ejecutó reset ni SQL modificador en la base real.
