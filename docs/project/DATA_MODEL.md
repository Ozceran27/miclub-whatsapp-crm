# Data Model

## Alcance

Mapa lógico para orientar a agentes. Para DDL exacto consultar migrations y `migrationManifest`.

## Esquema

El código observado utiliza el esquema PostgreSQL `miclub`.

El ledger de migrations se documenta como `public.miclub_schema_migrations`.

## Ownership conceptual

### Global / producto

Confirmar en migrations, pero conceptualmente:

- `category_catalog`
- `plans`
- definiciones/catálogos de producto
- templates globales
- migration ledger

### Tenant-scoped

- clubs
- club_onboarding
- club_subscriptions
- roles si el modelo vigente los aprovisiona por club
- user_club_memberships
- people
- employees
- sectors
- activities
- activity_terms
- payment_methods
- movement_categories
- movements
- enrollments
- receivables/payments
- settlements
- tasks
- requests
- imports
- audit tenant

### Identity

`users` no debe tratarse como tabla “del primer club”. El acceso tenant se resuelve mediante memberships.

## Provisioning observado

`provisionClub()` crea en una transacción:

1. clubs
2. tenant RLS context (`app.club_id`)
3. club_subscriptions FREE
4. club_onboarding
5. roles
6. users
7. people
8. user_club_memberships
9. employees
10. sectores system
11. payment methods
12. movement categories desde catálogo global

## Integridad crítica

- Membership debe impedir cruces incompatibles.
- Activity sector/responsible deben ser del mismo tenant.
- Sequence_number, si existe, debe ser único por club y concurrency-safe.
- Terms históricos deben evitar solapamientos incoherentes.
- Settlement allocations respetan unicidad parcial por movimiento/tipo mientras estén activas.

## RLS / tenant context

El provisioning observado establece `set_config('app.club_id', clubId, true)`.

Toda migration nueva debe respetar políticas RLS existentes.

## Migration Manifest

- `migrationManifest` define orden.
- No inferir por filesystem.
- No modificar migration aplicada.
- Nueva migration al final.
- Timestamp nuevo único.
- Checksums/ledger coherentes.

## Reset tenant

Debe conservar schema, migration ledger y catálogos globales; borrar business data tenant y validar zero-tenant startup.

Todo SQL contra DB real se ejecuta manualmente en DBeaver.
