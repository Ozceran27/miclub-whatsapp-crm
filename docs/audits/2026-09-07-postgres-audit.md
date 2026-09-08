# Auditoría estructural PostgreSQL local — 2026-09-07

Estado: inventario estructural obtenido; auditoría del ledger bloqueada por permisos. No certifica readiness ni ausencia total de drift.

## Método y seguridad

Captura UTC: 2026-09-08T00:53:51.211Z. Conexión exclusiva mediante AUDIT_DATABASE_URL de .env.codex.local, sin publicar credenciales. Gate confirmado antes de catálogos: current_user=miclub_audit; transaction_read_only=on. Catálogos consultados en transacción REPEATABLE READ READ ONLY, terminada con ROLLBACK. No se ejecutaron DDL, migraciones, escrituras, nextval ni funciones de negocio. No se consultaron filas operativas/personales. El ledger devolvió 42501 (permiso insuficiente); no se obtuvo su contenido y no se afirma que esté vacío.

Se compararon migrationManifest.ts, SQL de sus 94 entradas (lectura estática y hashes LF), migrationCompatibility.ts, docs/migration-manifest-policy.md, DATA_MODEL.md y ARCHITECTURE.md. No se reconstruyó una base descartable; la comparación no es un diff exhaustivo contra una instalación canónica ejecutada.

## Inventario

- Versión observada: PostgreSQL 18.4 on x86_64-windows, compiled by msvc-19.44.35227, 64-bit.
- Schemas de usuario: miclub, public.
- Tablas: 68 (67 miclub, 1 ledger public). Todas tienen PK.
- Columnas: 971, incluidas las de las 24 vistas.
- Restricciones: {"n":452,"f":161,"c":107,"p":68,"t":2,"u":32,"x":1}. p=PK, f=FK, u=UNIQUE, c=CHECK, x=EXCLUDE, n=NOT NULL (PostgreSQL 18), t=constraint trigger.
- Índices: 258; todos valid/ready. Esto no demuestra ausencia de índices redundantes ni rendimiento adecuado.
- Enums: 10, 60 etiquetas.
- Secuencias: club_capabilities_id_seq, club_subscriptions_id_seq, crm_message_history_legacy_id_seq. No se consumieron valores.
- Triggers de usuario: 26, todos habilitados O; funciones propias inspeccionadas: 26.
- RLS: 34 tablas habilitadas; 14 forzadas; 35 políticas.

Se inspeccionaron las definiciones de columnas, defaults, PK/FK/UNIQUE/CHECK/EXCLUDE, índices, enums, secuencias, vistas, triggers, funciones y policies. Se conservan en este informe los resultados agregados, hallazgos y matrices de ownership y referencias tenant. La captura JSON completa y los scripts auxiliares no se incluyen en el commit; para recuperar las definiciones completas será necesaria una nueva captura de solo lectura. Este informe no es un dump del esquema.

## Hallazgos

### Alta — ledger inaccesible

public.miclub_schema_migrations existe, con PK(name), checksum y applied_at, pero miclub_audit no puede leerlo (42501). No se pueden verificar migraciones faltantes, adicionales, checksums aplicados ni cronología. No ampliar permisos automáticamente ni insertar registros. Se entrega consulta manual separada para DBeaver con un rol ya autorizado.

### Alta — referencias tenant simples

Se identificaron 50 FKs simples entre tablas con club_id sin FK compuesta equivalente. Una FK por UUID evita la referencia a un padre inexistente, pero no exige que padre e hijo tengan el mismo club. En movements y enrollments las referencias a actividades/personas y otras entidades tenant no tienen FK compuesta ni trigger específico de validación tenant observado. RLS limita la fila principal, no sustituye esa comprobación. Riesgo estructural confirmado, sin afirmar que existan datos cruzados.

Employees, tasks y approval_requests sí tienen triggers que validan las referencias tenant del hijo al escribir; se conservan como protección existente. Esto no equivale a una FK compuesta que también proteja modificaciones del padre. No se hicieron pruebas de escritura ni tests A/B contra esta DB.

### Media — seis restricciones NOT VALID en activities

- activities_created_by_fkey: FOREIGN KEY (created_by) REFERENCES people(id) NOT VALID
- activities_settlement_category_fkey: FOREIGN KEY (settlement_category_id) REFERENCES movement_categories(id) NOT VALID
- activities_settlement_fixed_amount_nonnegative_check: CHECK (settlement_fixed_amount IS NULL OR settlement_fixed_amount >= 0::numeric) NOT VALID
- activities_settlement_fixed_amount_required_check: CHECK (settlement_mode IS DISTINCT FROM 'fixed'::text OR settlement_fixed_amount IS NOT NULL) NOT VALID
- activities_settlement_mode_allowed_check: CHECK (settlement_mode IS NULL OR (settlement_mode = ANY (ARRAY['none'::text, 'percent'::text, 'fixed'::text, 'category'::text]))) NOT VALID
- activities_updated_by_fkey: FOREIGN KEY (updated_by) REFERENCES people(id) NOT VALID

Coinciden con DDL manual docs/dbeaver/11_activities_manual_metadata_audit_and_add_columns.sql. Son evidencia de objetos compatibles con ese script, no prueba de su ejecución. NOT VALID no certifica filas previas; sigue imponiendo la restricción a nuevas operaciones pertinentes. No validar ni reinterpretar actor Person/User sin revisar el contrato vigente.

### Alta — cálculo FIXED antiguo presente en la vista real

v_activity_settlement_balances usa activity_terms.monthly_fixed_fee; activity_terms conserva también fixed_club_fee y campos de frecuencia/moneda. Confirma la discrepancia B03 descrita en CURRENT_STATE/ARCHITECTURE; no es una nueva regla económica. La vista también filtra liquidaciones COMPLETADO y usa timezone Argentina constante. Debe reconciliarse en una migración nueva con pruebas VARIABLE/FIXED, períodos, moneda y términos históricos; no reemplazarla a ciegas.

### Media — cobertura RLS parcial y relaciones indirectas

miclub_runtime es NOSUPERUSER/NOBYPASSRLS/NOLOGIN; miclub_admin tiene BYPASSRLS. El gate no prueba privilegios efectivos de conexiones HTTP. Hay tablas tenant sin RLS (ver matriz); coincide con la advertencia canónica de cobertura parcial. No se demuestra una fuga sólo por falta de RLS.

activity_schedules deriva tenant de activities por FK y no tiene club_id. exchange_rate_usage_components deriva tenant de exchange_rate_usages. sector_settlements enlaza sector y responsable mediante FKs independientes: no asegura mismo club. opening_balance_movements enlaza batch/movement/reversión mediante FKs independientes: su policy comprueba el batch, no la igualdad de tenant entre todos los padres. Son candidatos de endurecimiento, no tablas globales.

audit_log.club_id es nullable, coherente con eventos globales de identidad; no proponer NOT NULL indiscriminado. Tablas con club_id pero sin FK directa a clubs: activity_terms_migration_diagnostic; pueden tener recorrido indirecto y deben evaluarse por dominio.

## Comparación con repositorio y drift

- Manifiesto: 94 entradas. Hashes LF distintos: 0. SQL fuera del manifiesto: 0.
- Objetos provides/requires declarados ausentes: 0. El grafo es parcial; presencia no certifica definición idéntica. display_metadata es un marcador lógico de siete columnas de plans, todas presentes, no una columna física.
- La constraint selection_source real admite pre_billing_onboarding, coherente con 202609050001.
- La función replace_opening_balances real usa pagado, coherente con 202609050002. No se ejecutó.
- 202609050003 modifica datos CMV: no puede certificarse con catálogos estructurales ni con ledger inaccesible.
- Existen employees, club_onboarding y tablas CRM: no confundir los prerrequisitos ausentes del bootstrap versionado (B01) con tablas ausentes en esta DB. Su origen y reproducibilidad siguen pendientes.
- DATA_MODEL omite de su resumen activity_schedules, sector_settlements y billing_payment_confirmations; la matriz adjunta refleja el inventario real.
- Definiciones manuales, seis restricciones NOT VALID y propietarios mixtos miclub_app/postgres son indicadores de evolución histórica; por sí solos no prueban drift no autorizado.
- Las transformaciones de migrationCompatibility afectan instalación y no cambian el hash canónico registrado; una comparación textual ingenua no es concluyente.

## Matriz global/tenant

| Tabla | Clasificación | club_id | RLS / FORCE |
|---|---|---|---|
| miclub.activities | Tenant directo | NOT NULL | true / true |
| miclub.activity_fee_cleanup_candidates | Tenant directo | NOT NULL | true / false |
| miclub.activity_fee_history | Tenant directo | NOT NULL | true / false |
| miclub.activity_icon_aliases | Global | — | false / false |
| miclub.activity_icon_catalog | Global | — | false / false |
| miclub.activity_schedules | Tenant indirecto → activities | — | false / false |
| miclub.activity_settlement_allocations | Tenant directo | NOT NULL | false / false |
| miclub.activity_settlements | Tenant directo | NOT NULL | false / false |
| miclub.activity_terms | Tenant directo | NOT NULL | false / false |
| miclub.activity_terms_migration_diagnostic | Tenant directo | NOT NULL | false / false |
| miclub.app_sessions | Interna/global | — | false / false |
| miclub.approval_requests | Tenant directo | NOT NULL | false / false |
| miclub.audit_log | Mixto: auditoría global/tenant | nullable | true / false |
| miclub.billing_payment_confirmations | Tenant directo | NOT NULL | true / true |
| miclub.category_catalog | Global | — | false / false |
| miclub.category_import_aliases | Global | — | false / false |
| miclub.club_capabilities | Tenant directo | NOT NULL | false / false |
| miclub.club_memberships | Tenant directo | NOT NULL | true / true |
| miclub.club_onboarding | Tenant directo | NOT NULL | false / false |
| miclub.club_subscriptions | Tenant directo | NOT NULL | false / false |
| miclub.clubs | Raíz tenant | — | false / false |
| miclub.crm_message_history | Tenant directo | NOT NULL | true / true |
| miclub.crm_message_templates | Tenant directo | NOT NULL | true / true |
| miclub.currencies | Global | — | false / false |
| miclub.discount_rates | Tenant directo | NOT NULL | true / false |
| miclub.employee_photos | Tenant directo | NOT NULL | true / true |
| miclub.employees | Tenant directo | NOT NULL | false / false |
| miclub.enrollment_fee_audit | Tenant directo | NOT NULL | true / false |
| miclub.enrollments | Tenant directo | NOT NULL | true / true |
| miclub.exchange_rate_sync_state | Global | — | false / false |
| miclub.exchange_rate_usage_components | Tenant indirecto → exchange_rate_usages | — | false / false |
| miclub.exchange_rate_usages | Tenant directo | NOT NULL | false / false |
| miclub.exchange_rates | Global | — | false / false |
| miclub.features | Global | — | false / false |
| miclub.financial_accounts | Tenant directo | NOT NULL | true / false |
| miclub.import_amount_normalization_rules | Interna/global | — | false / false |
| miclub.import_batches | Tenant directo | NOT NULL | true / true |
| miclub.import_errors | Tenant directo | NOT NULL | true / true |
| miclub.instructors | Tenant directo | NOT NULL | true / false |
| miclub.movement_categories | Tenant directo | NOT NULL | true / false |
| miclub.movements | Tenant directo | NOT NULL | true / true |
| miclub.onboarding_operations | Tenant directo | NOT NULL | true / true |
| miclub.opening_balance_batches | Tenant directo | NOT NULL | true / false |
| miclub.opening_balance_movements | Tenant indirecto → batch y movement; concordancia no impuesta por FK | — | true / false |
| miclub.operational_balances | Tenant directo | NOT NULL | true / false |
| miclub.payment_allocations | Tenant directo | NOT NULL | true / false |
| miclub.payment_methods | Tenant directo | NOT NULL | true / false |
| miclub.payments | Tenant directo | NOT NULL | true / false |
| miclub.people | Tenant directo | NOT NULL | true / true |
| miclub.person_kind_links | Tenant directo | NOT NULL | true / false |
| miclub.plan_entitlements | Global | — | false / false |
| miclub.plans | Global | — | false / false |
| miclub.rate_limit_buckets | Interna/global | — | false / false |
| miclub.receivables | Tenant directo | NOT NULL | true / false |
| miclub.roles | Tenant directo | NOT NULL | true / false |
| miclub.salon_hour_prices | Tenant directo | NOT NULL | true / false |
| miclub.sector_settlements | Tenant indirecto → sectors; persona independiente | — | false / false |
| miclub.sector_templates | Global | — | false / false |
| miclub.sectors | Tenant directo | NOT NULL | true / false |
| miclub.sheet_metric_snapshots | Tenant directo | NOT NULL | true / false |
| miclub.system_months | Interna/global | — | false / false |
| miclub.tasks | Tenant directo | NOT NULL | false / false |
| miclub.tenant_sequences | Tenant directo | NOT NULL | false / false |
| miclub.user_club_memberships | Tenant directo | NOT NULL | true / true |
| miclub.users | Global | — | false / false |
| miclub.worker_invitations | Tenant directo | NOT NULL | false / false |
| miclub.xlsx_import_rows | Tenant directo | NOT NULL | true / true |
| public.miclub_schema_migrations | Infraestructura: ledger | — | false / false |

## Referencias tenant simples para revisión

No todas representan el mismo riesgo; considerar triggers y semántica de actor.

| Tabla | FK | Definición |
|---|---|---|
| activities | activities_created_by_fkey | FOREIGN KEY (created_by) REFERENCES people(id) NOT VALID |
| activities | activities_settlement_category_fkey | FOREIGN KEY (settlement_category_id) REFERENCES movement_categories(id) NOT VALID |
| activities | activities_updated_by_fkey | FOREIGN KEY (updated_by) REFERENCES people(id) NOT VALID |
| activity_fee_cleanup_candidates | activity_fee_cleanup_candidates_activity_id_fkey | FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE |
| activity_fee_history | activity_fee_history_activity_id_fkey | FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE |
| activity_fee_history | activity_fee_history_import_batch_id_fkey | FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) |
| activity_terms_migration_diagnostic | activity_terms_migration_diagnostic_activity_id_fkey | FOREIGN KEY (activity_id) REFERENCES activities(id) |
| approval_requests | approval_requests_assigned_to_membership_id_fkey | FOREIGN KEY (assigned_to_membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| approval_requests | approval_requests_decided_by_membership_id_fkey | FOREIGN KEY (decided_by_membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| approval_requests | approval_requests_requested_by_membership_id_fkey | FOREIGN KEY (requested_by_membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| audit_log | audit_log_membership_id_fkey | FOREIGN KEY (membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| billing_payment_confirmations | billing_payment_confirmations_subscription_id_fkey | FOREIGN KEY (subscription_id) REFERENCES club_subscriptions(id) |
| club_memberships | club_memberships_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE |
| crm_message_history | crm_message_history_enrollment_id_fkey | FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) |
| crm_message_history | crm_message_history_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) |
| employee_photos | employee_photos_employee_id_fkey | FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE |
| employees | employees_membership_id_fkey | FOREIGN KEY (membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| employees | employees_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT |
| employees | employees_sector_id_fkey | FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL |
| enrollment_fee_audit | enrollment_fee_audit_enrollment_id_fkey | FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE |
| enrollment_fee_audit | enrollment_fee_audit_import_batch_id_fkey | FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL |
| enrollments | enrollments_activity_id_fkey | FOREIGN KEY (activity_id) REFERENCES activities(id) |
| enrollments | enrollments_missing_from_import_batch_id_fkey | FOREIGN KEY (missing_from_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL |
| enrollments | enrollments_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) |
| import_batches | import_batches_dry_run_of_batch_id_fkey | FOREIGN KEY (dry_run_of_batch_id) REFERENCES import_batches(id) |
| instructors | instructors_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE |
| movements | movements_account_id_fkey | FOREIGN KEY (account_id) REFERENCES financial_accounts(id) |
| movements | movements_activity_id_fkey | FOREIGN KEY (activity_id) REFERENCES activities(id) |
| movements | movements_category_id_fkey | FOREIGN KEY (category_id) REFERENCES movement_categories(id) |
| movements | movements_counterparty_person_id_fkey | FOREIGN KEY (counterparty_person_id) REFERENCES people(id) |
| movements | movements_payment_method_id_fkey | FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) |
| movements | movements_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) |
| movements | movements_sector_id_fkey | FOREIGN KEY (sector_id) REFERENCES sectors(id) |
| opening_balance_batches | opening_balance_batches_replaces_batch_id_fkey | FOREIGN KEY (replaces_batch_id) REFERENCES opening_balance_batches(id) |
| operational_balances | operational_balances_sector_id_fkey | FOREIGN KEY (sector_id) REFERENCES sectors(id) |
| payment_allocations | payment_allocations_payment_id_fkey | FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE |
| payment_allocations | payment_allocations_receivable_id_fkey | FOREIGN KEY (receivable_id) REFERENCES receivables(id) |
| payments | payments_movement_id_fkey | FOREIGN KEY (movement_id) REFERENCES movements(id) |
| payments | payments_payment_method_id_fkey | FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) |
| payments | payments_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) |
| person_kind_links | person_kind_links_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE |
| receivables | receivables_activity_id_fkey | FOREIGN KEY (activity_id) REFERENCES activities(id) |
| receivables | receivables_enrollment_id_fkey | FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) |
| receivables | receivables_person_id_fkey | FOREIGN KEY (person_id) REFERENCES people(id) |
| receivables | receivables_sector_id_fkey | FOREIGN KEY (sector_id) REFERENCES sectors(id) |
| tasks | tasks_assigned_to_membership_id_fkey | FOREIGN KEY (assigned_to_membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| tasks | tasks_created_by_membership_id_fkey | FOREIGN KEY (created_by_membership_id) REFERENCES user_club_memberships(id) ON DELETE SET NULL |
| worker_invitations | worker_invitations_membership_id_fkey | FOREIGN KEY (membership_id) REFERENCES user_club_memberships(id) |
| worker_invitations | worker_invitations_role_id_fkey | FOREIGN KEY (role_id) REFERENCES roles(id) |
| xlsx_import_rows | xlsx_import_rows_batch_id_fkey | FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE |

## Propuesta manual y pendientes

1. Ejecutar únicamente el archivo 2026-09-07-ledger-manual.sql en DBeaver con conexión autorizada y entregar el resultado. No requiere cambiar permisos del auditor.
2. Completar comparación nombre/checksum/orden con las 94 entradas. No marcar migraciones como aplicadas para hacer coincidir el ledger.
3. Preparar cambios temáticos versionados para referencias tenant y cálculo FIXED, después de revisar datos en un alcance separado y validar en PostgreSQL descartable.
4. Para las seis NOT VALID, investigar filas históricas y semántica de actor; luego generar validación con pre/postcondiciones y rollback según el cambio decidido. No se entrega DDL correctivo ejecutable sin esa evidencia.
5. Mantener B01 y los gates de instalación limpia/aislamiento abiertos. No autoriza reset.

## Archivos y validación

Se conservan únicamente este informe y `2026-09-07-ledger-manual.sql` bajo docs/audits. Se retiraron los scripts auxiliares, las capturas JSON y los logs locales tras sintetizar sus resultados. No se modificó código de producto ni docs canónicas. Base: cero cambios. SQL generado: consulta SELECT del ledger para ejecución manual, no migración ni reparación. Los resultados de tests/build/typecheck/lint se detallan a continuación.

### Validación local del repositorio

- Commit observado: 1dd441e05ba4762a567eda0878f76693d4a82523. Working tree inicial limpio.
- npm run typecheck: aprobado.
- npm run build: aprobado; warning de chunk web mayor a 500 kB.
- npm run db:migrations:check: 14/15 aprobados; falla comparación del checkpoint post-admin por CRLF frente a LF. No se modificó el archivo histórico.
- Checksums LF recalculados independientemente: 94/94 coinciden; inventario SQL sin extras.
- No se ejecutaron tests de integración con la base real ni pruebas de escritura.
- npm run lint: falló con 289 errores y 578 warnings; 7 errores pertenecían a los scripts nuevos (globals Node/import sin uso) y se corrigieron. Los otros 282 errores corresponden al resto del repositorio. La verificación focal de los scripts aprobó después de corregirlos; dichos scripts y los logs se retiraron del entregable final. Estos resultados corresponden a la auditoría original, no a una nueva ejecución tras la limpieza documental.
