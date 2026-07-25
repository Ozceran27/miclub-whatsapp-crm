# Auditoría de constraints para multitenencia

Esta auditoría compara el dump `apps/api/data/db/dump-miclub_gestion-202607241617.txt`
con todas las migraciones anteriores a `202607250001`. La regla es que una clave de
negocio pertenece al club; las claves técnicas pueden continuar siendo globales.

## Reemplazos de unicidad

| Tabla | Constraint/índice anterior | Reemplazo por club |
| --- | --- | --- |
| `people` | `dni` | `(club_id, dni)` parcial cuando `dni is not null` |
| `person_kind_links` | `(person_id, kind)` | `(club_id, person_id, kind)` |
| `sectors` | `code`, `lower(code)`, `lower(name)` | `(club_id, lower(code))` y `(club_id, lower(name))` |
| `instructors` | `person_id` (y `code` en instalaciones creadas por la migración inicial) | `(club_id, person_id)` y `(club_id, lower(code))` si existe la columna |
| `activities` | `code`; `(sector_id, name, modality)` | `(club_id, lower(code))` si existe `code`; `(club_id, sector_id, lower(name), coalesce(lower(modality), ''))` |
| `movement_categories` | `name`, `lower/trim(name)` (y `code` en la migración inicial) | `(club_id, upper(trim(name)))` y `(club_id, lower(code))` si existe `code` |
| `payment_methods` | `name` | `(club_id, lower(name))` |
| `discount_rates` | `percent` | `(club_id, percent)` |
| `roles` | `code` | `(club_id, lower(code))` |
| `salon_hour_prices` | `hours` | `(club_id, hours)` |
| `enrollments` | `external_id` | `(club_id, external_id)` |
| `movements` | `external_id` | `(club_id, external_id)` |
| `payment_allocations` | `(payment_id, receivable_id)` | `(club_id, payment_id, receivable_id)` |
| `operational_balances` | `(source, cutoff_date)` | `(club_id, source, cutoff_date)` |
| `sheet_metric_snapshots` | `(metric_key, captured_at)` | `(club_id, metric_key, captured_at)` |
| `club_memberships` | ya compuesta | `(club_id, person_id)` y `(club_id, lower(membership_number))` |

Los `id` UUID/bigserial siguen siendo claves primarias globales: son identidades
técnicas, se referencian ampliamente y no representan nombres de negocio. También
permanecen globales `currencies.code` (ISO/moneda compartida),
`import_amount_normalization_rules.context` (configuración del importador) y las
claves de `system_months` (catálogo calendario). `clubs.code` es global porque
identifica al tenant. `app_users.email` permanece global porque identifica la cuenta
de autenticación, que puede acceder a más de un club. Las claves primarias de tablas
hijas de una entidad globalmente identificada
(`activity_fee_cleanup_candidates.activity_id`) permanecen globales.

Las demás claves primarias del dump son identificadores técnicos y no necesitan
reescritura. Todas las claves foráneas y constraints de dominio (`CHECK`, enums y
`NOT NULL`) conservan su semántica referencial; esta fase agrega `NOT NULL` a los
`club_id` después del backfill. Las tablas sin `club_id` en fase 1 (`app_users`,
`currencies`, `import_amount_normalization_rules`, `system_months` y tablas CRM/audit
que dependen de identificadores globales) quedan deliberadamente fuera del cambio.

## Orden seguro aplicado

`202607250001_backfill_and_scope_unique_constraints.sql` crea/selecciona el club
legado, completa primero todos los `club_id` y membresías, aborta si queda algún
nulo o si aparecen duplicados dentro de un club, y **recién después** elimina las
restricciones globales y crea sus reemplazos compuestos. Finalmente hace `club_id`
obligatorio. De ese modo nunca existe una ventana en que la unicidad quede relajada
antes de validar los datos.
