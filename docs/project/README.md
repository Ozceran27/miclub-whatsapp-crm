# miClub Gestión — Project Knowledge Base

Esta carpeta es la **capa de contexto de proyecto** para ChatGPT, Work, Codex y el equipo humano.

Su función no es reemplazar la documentación técnica canónica ya existente en `docs/`, sino dar a cualquier agente una entrada rápida y coherente al estado, arquitectura, reglas y objetivos del proyecto.

## Autoridad y precedencia

Ante contradicciones, usar este orden:

1. **Código runtime actual + migraciones versionadas**.
2. **Documentación canónica especializada existente en `docs/`**.
3. **Documentos de `docs/project/`** como síntesis y mapa de navegación.
4. Historial Git y documentos históricos como evidencia de evolución, no como especificación vigente.

No reinterpretar una regla de negocio sólo porque un documento histórico la describa de otra manera.

## Documentos de esta carpeta

- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — qué producto estamos construyendo y para quién.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — checkpoint operativo y siguiente objetivo.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — arquitectura de alto nivel y fuentes de verdad.
- [`BUSINESS_RULES.md`](BUSINESS_RULES.md) — reglas de negocio que no deben duplicarse ni reinterpretarse.
- [`DOMAIN_MODEL.md`](DOMAIN_MODEL.md) — entidades y relaciones conceptuales.
- [`DATA_MODEL.md`](DATA_MODEL.md) — mapa lógico de PostgreSQL, ownership y migraciones.
- [`API_CONTRACTS.md`](API_CONTRACTS.md) — superficies HTTP y convenciones de acceso.
- [`ONBOARDING.md`](ONBOARDING.md) — flujo de alta y configuración inicial.
- [`FINANCIAL_MODEL.md`](FINANCIAL_MODEL.md) — movimientos, saldos, categorías y liquidaciones.
- [`IMPORT_SYSTEM.md`](IMPORT_SYSTEM.md) — contrato XLSX universal.
- [`TENANCY_AND_RBAC.md`](TENANCY_AND_RBAC.md) — aislamiento tenant, memberships, roles y permisos.
- [`PLANS_AND_FEATURES.md`](PLANS_AND_FEATURES.md) — planes comerciales y capabilities.
- [`TESTING.md`](TESTING.md) — gates y escenarios de prueba.
- [`ROADMAP.md`](ROADMAP.md) — hitos próximos.
- [`DECISIONS.md`](DECISIONS.md) — decisiones arquitectónicas aceptadas.
- [`CHANGELOG_DEV.md`](CHANGELOG_DEV.md) — resumen humano de checkpoints importantes.

## Documentación especializada ya existente que sigue siendo canónica

Consultar especialmente:

- `docs/pre-reset-readiness.md`
- `docs/architecture-current.md`
- `docs/architecture.md`
- `docs/runtime-boundaries.md`
- `docs/migration-manifest-policy.md`
- `docs/api-route-inventory.md`
- `docs/tenant.md`
- `docs/onboarding.md`
- `docs/economy.md`
- `docs/import-xlsx.md`
- `docs/migration/xlsx-v1.md`
- `docs/business-rules/activity-settlement-allocations.md`
- `docs/deployment-runbook.md`
- `docs/postgres-cutover-runbook.md`

## Nota de sincronización

Este paquete fue preparado el **2026-09-07** tomando como referencia el repositorio `Ozceran27/miclub-whatsapp-crm` en `main`, la documentación disponible allí y el contexto de dirección del proyecto.

Si existen cambios locales no pusheados posteriores, **Codex debe auditar el checkout local y actualizar `CURRENT_STATE.md` antes de tratar estos documentos como snapshot exacto**.

El bootstrap local fue realizado sobre `42b81a363c4eee04dd4d3bbaceaff116d7c26891` y esta carpeta se sincronizó con su informe aprobado. CURRENT_STATE conserva resultados y conflictos; no se modificaron código ni SQL ni se inspeccionó DB real.

La precedencia de implementación no convierte un bug en regla de negocio. Los conflictos C01–C05 siguen abiertos y las fórmulas aceptadas se conservan. PROJECT_CONTEXT sigue siendo propósito de producto, no certificación funcional.

Drift especializado pendiente fuera de esta carpeta: runtime-boundaries describe carga dinámica SQLite y ruta XLSX obsoletas; los SQL tenant-deletion tienen un manifiesto incompleto. Ver ARCHITECTURE/DATA_MODEL antes de usarlos. Esta actualización no modifica aquellos archivos.
