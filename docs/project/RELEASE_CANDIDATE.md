# Release candidate — ejecución

Baseline de partida: `bec17e642b3a6f151aaab62a51b179926a7da5bb`, main, 2026-09-08.
Plan aprobado en la conversación. Este documento registra ejecución, no certifica
una release por la mera existencia de tareas o scripts.

## Decisiones aprobadas

- Baseline versionado sin tenants; ledger registra sólo SQL ejecutado.
- Onboarding persistente y finalización atómica; contraseñas sólo como hash privado.
- Plan activado al finalizar, sin cobro. FREE nunca habilita DATA_MIGRATION.
- Invitaciones en bandeja autenticada; cierre de liquidaciones explícito.
- FIXED mensual sólo meses completos; proyectado como disponibilidad neta.
- SQL real exclusivamente manual por DBeaver. No reset ni reparación histórica.

## Backlog

Verificación tras la interrupción (2026-09-08, árbol de trabajo sin commit):

- Typecheck y build: PASS. Bundle web 812,23 kB; optimización pendiente.
- Suite local: 469 tests, 464 PASS, 5 FAIL. Fallan startup Windows, comparación
  documental de activity terms, fixture de último Director y dos assertions UI
  (sr-only/iconos). No declarar la suite verde.
- Regresión PostgreSQL de saldos: 5 PASS, 0 FAIL, incluyendo registro/login HTTP,
  finalización sin workers/actividades opcionales, replay y rollback; además se
  ejecutó el script manual sobre instalación aislada ya actualizada.
- Gate de migraciones: 15 PASS. 94 SQL históricos intactos, 3 deltas nuevos y
  baseline separado. Inventario SQL manual de baja sincronizado; no ejecutado.
- Gate sin Google Sheets runtime: PASS.
- Lint y deadcode: FAIL; quedan cientos de hallazgos. Se excluyeron únicamente
  archivos temporales de evidencia, sin deshabilitar reglas para código de producto.
- No se certificaron restore, paridad legacy, A/B completo ni E2E visual.

El parche manual de onboarding no depende de aplicar el baseline a la base real.
El baseline sólo sirve para instalaciones vacías. El ledger real sigue sin ser
certificado: el acceso de auditoría no permite leerlo; el script manual falla si
falta el ledger o existe un checksum incompatible, sin inventar historial.

Persisten particularmente B1–B3, B5, C1 completo, C3–C6 y D–E. Actividades conserva
la incompatibilidad User/Person de actores detectada en A5 y no queda certificada
por la regresión limitada a saldos. Se necesita completar ese dominio antes de
afirmar que cualquier borrador de onboarding puede finalizar.

| Tarea | Estado | Evidencia / pendiente |
| --- | --- | --- |
| A1 Entorno aislado y tests portables | Parcial | Cluster PG18 loopback:55438 marcado; runner portable; gates completos pendientes |
| A2 Baseline y runner | Parcial | Instalación usada por regresión de saldos; falta paridad legacy y restore |
| A3 RLS operaciones | Parcial | Contexto añadido a actividades/movimientos/inscripciones; falta certificación A/B |
| A4 RLS lecturas/CRM | Parcial | Contexto añadido; unit tests pasan, integración completa pendiente |
| A5 Referencias tenant/actores | Pendiente | Migraciones con prechecks |
| A6 Registro/auth/logout/zero-tenant | Parcial | Registro/login HTTP comprobados; revocación endurecida; logout/múltiples pestañas pendientes |
| B1 Persistencia onboarding | Pendiente | Revisión concurrente |
| B2 Credenciales/fotos | Pendiente | Sin secretos en GET/logs |
| B3 Walkthrough | Pendiente | Refresh, foco, errores, móvil |
| B4 Sectores/actividades | Pendiente | Templates y relaciones vigentes |
| B5 Invitaciones/Instructor | Pendiente | Destinatario, revocación, expiración |
| B6 Workers/saldos/finalización | Parcial | Saldos/finalización/replay/rollback PG pasan; workers y actividades pendientes |
| C1 Planes/features | Pendiente | Cuatro planes; FREE bloqueado |
| C2 XLSX | Parcial | ANULADO conservado y status desconocido rechazado; falta recorrido import completo |
| C3 Cálculo liquidaciones | Pendiente | VARIABLE 40000; FIXED 320000 |
| C4 Cierre/allocations | Pendiente | Concurrencia e historia |
| C5 Categorías/importes/proyectado | Pendiente | Sin heurísticas de escala |
| C6 Operaciones entre módulos | Pendiente | Secuencias, personas, estados |
| D1 Inicio/Economía | Pendiente | Empty states y agregados |
| D2 Administración/CRM | Pendiente | Recorrido operativo |
| D3 Seguridad/recuperación | Pendiente | Configuración y autorización |
| D4 Lint/deadcode/drift | Pendiente | Sin silenciar reglas globalmente |
| E1 Suite/regresiones | Pendiente | Baseline: 458/465; lint 282 errores |
| E2 Integraciones/E2E | Pendiente | Instancia aislada, escritorio y móvil |
| E3 Documentación/checkpoint | Pendiente | P0=0 y P1=0 exigidos |

## Veredicto

READY FOR STABLE RELEASE: **NO**. No se ejecutó SQL modificador contra la base real.
