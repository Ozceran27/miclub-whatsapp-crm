# Data Model

## Alcance auditado

Schema operacional miclub; ledger public.miclub_schema_migrations. Inventario derivado del repositorio al commit 42b81a3; no inspección de DB real ni afirmación de migraciones aplicadas.

## Ownership

| Grupo | Tablas |
| --- | --- |
| Raíz / identidad | clubs (raíz tenant), users (global) |
| Producto global | currencies, category_catalog, category_import_aliases, sector_templates, activity_icon_catalog, activity_icon_aliases, features, plans, plan_entitlements |
| Cotizaciones globales | exchange_rates, exchange_rate_sync_state |
| Tenant operativo | people, person_kind_links, club_memberships, user_club_memberships, roles, employees, instructors, sectors, activities, activity_terms, movements, enrollments, payments, payment_allocations, receivables |
| Catálogos tenant | movement_categories, payment_methods, discount_rates, salon_hour_prices |
| Tenant configuración | club_onboarding, club_subscriptions, club_capabilities, financial_accounts, opening_balance_batches, opening_balance_movements |
| Tenant trazabilidad | tasks, approval_requests, worker_invitations, employee_photos, onboarding_operations, tenant_sequences, import_batches, import_errors, xlsx_import_rows, exchange_rate_usages, exchange_rate_usage_components |
| Internas/históricas | system_months, app_sessions, rate_limit_buckets, audit_log; operational_balances, sheet_metric_snapshots y tablas de diagnóstico/normalización |

Audit log admite contexto de identidad/tenant según evento. Las tablas históricas con club_id siguen requiriendo aislamiento; el grupo “internas” no las exime. No usar esta síntesis como inventario ejecutable de reset.

## Integridad

- PK UUID donde corresponde; CRM conserva identificadores de compatibilidad propios.
- Activity→sector/instructor/manager usa FKs compuestas con club_id, ON DELETE RESTRICT e índices alineados.
- Settlement→activity/term y allocation→movement conservan tenant por FK compuesta.
- activity_terms: exclusión GiST de rangos solapados y constraint trigger diferido de continuidad.
- tenant_sequences: upsert atómico por club/entity; UNIQUE (club_id, sequence_number) en movimientos e inscripciones.
- Allocations: unicidad parcial (club_id, movement_id, allocation_type) mientras no canceladas/anuladas; movimientos indivisibles por tipo.
- Onboarding: advisory lock por club, operation/idempotency key y resultado en una transacción.
- Movimientos: idempotency key por club y control optimista; archivo/anulación conserva historia.

Fuentes: migrations 202608130001/2/6, 202608140005, 202608150001/2/5 y 202608270004.

## RLS

miclub_runtime es NOBYPASSRLS; miclub_admin usa credenciales separadas. La migración 202608150004 fuerza RLS prioritario en people, club_memberships, user_club_memberships, movements, enrollments, activities, CRM, import_batches/errors y xlsx_import_rows. Políticas de fotos usan app.current_club_id; withTenantTransaction establece ambos nombres de contexto.

No afirmar cobertura universal ni cumplimiento de todos los consumidores: B02 permanece abierto. Funciones de resolución de membership proporcionan bootstrap estrecho de autenticación.

## Orden e instalación

94 entradas en apps/api/src/scripts/migrationManifest.ts; última 202609050003_classify_cmv_as_non_operational.sql. Se intercalan raíz y multitenant; no ordenar por filename. Timestamps duplicados históricos permitidos: 202606280003, 202607020001, 202607020004, 202607250006.

runMigrations verifica hashes sobre LF, inventario y grafo. migrationCompatibility transforma dos vistas históricas al instalar migraciones aún no registradas. No editar SQL aplicado ni ledger.

**B01:** no hay creación en el manifiesto para todos los objetos que luego altera/utiliza: users/app_users, employees, club_onboarding y tablas CRM, entre otros prerrequisitos. DDL manual existe para employees, approval_requests y club_onboarding en docs/dbeaver/09, 10 y 13. Esto no prueba ausencia en DB real; sí impide afirmar instalación vacía autocontenida.

**B07:** tenant-deletion manual contiene 91 entradas frente a 94; faltan 202609050001–003. SQL no modificado en esta sincronización.

## Reset y drift

Validar ledger, schema, grants, RLS y backup/restauración en entorno aislado antes de reset. DDL manual/dumps no son prueba de estado aplicado ni reemplazo del manifiesto. SQL real: ejecución manual DBeaver. Ver docs/pre-reset-readiness.md y TESTING.md.
