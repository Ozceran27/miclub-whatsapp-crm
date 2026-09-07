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
