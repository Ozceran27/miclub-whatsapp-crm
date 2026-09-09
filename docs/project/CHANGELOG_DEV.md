# Development Changelog

Git continúa siendo el historial técnico autoritativo.

## 2026-09-07 — Sincronización del bootstrap aprobado

- Auditada implementación en 42b81a3; actualizado CURRENT_STATE primero y después arquitectura, dominio, datos, testing y contratos relacionados.
- Registrados resultados: typecheck/build aprobados; 458/465 tests; lint/deadcode fallidos; integraciones DB no ejecutadas.
- Corregidos vocabulario/catálogo demostrados (CMV no operativo), versión efectiva XLSX, draft onboarding temporal y pre-billing.
- Registrados bugs y decisiones abiertas sin cambiar fórmulas ni aprobar comportamiento defectuoso.
- Sólo documentación docs/project; sin cambios de código/SQL ni conexión a DB real.

## 2026-09-07 — AI engineering workspace bootstrap

### Added

- estructura `docs/project/`;
- base de conocimiento para ChatGPT, Work y Codex;
- separación entre documentación canónica especializada y síntesis de proyecto.

### Context

El proyecto ya había evolucionado hacia PostgreSQL, multi-tenancy, registro público, onboarding, sectores dinámicos, workers/instructors, activities/terms, XLSX universal, planes/features y retiro de Google Sheets runtime.

### Next en el checkpoint inicial (histórico)

- bootstrap audit sobre checkout local;
- reconciliar CURRENT_STATE;
- certificar readiness para reset;
- primer E2E limpio.

## Checkpoints anteriores

Consultar Git history, `docs/history/` y documentación canónica. No reconstruir todos los prompts históricos aquí.
# 2026-09-08 — Corrección de finalización y revisión RC parcial

- Reproducido el fallo de saldos por `sequence_number` omitido; migración nueva
  con secuencias tenant, reversión explícita y protección de negativos falsificados.
- Corregidos prerrequisitos de alta moderna de trabajadores y persistencia del paso 7.
- SQL manual DBeaver transaccional con ledger de ejecuciones reales, sin reset.
- Error de schema pendiente responde como actualización requerida; logs de errores
  del servidor no imprimen filas PostgreSQL ni secretos.
- Regresión real de saldos: 5 PASS. Build/typecheck y manifiesto pasan; suite global,
  lint, deadcode y certificación integral siguen pendientes. No es checkpoint RC.
# 2026-09-09 — Migración por plan, XLSX con actividad y categorías

- Navegación/guard comparten resolución efectiva de features, sin caché HTTP;
  onboarding propaga capacidades al menú.
- Plantilla v3 agrega AA Actividad, validación tenant/sector y persistencia en
  movements.activity_id. Referencias forman parte del hash del dry-run.
- Correcciones del lector XML/celdas vacías e instructores; descarga independiente
  del directorio de ejecución. retry/reversal rechazados hasta definirlos.
- Reservas/Señas en catálogo shared y migración aditiva; lista de ingresos de
  Economía derivada del catálogo. SQL real manual con ledger y pre/postchecks.
- Se documentan reglas acordadas de liquidación sin certificar cierre/arrastre.
