# PostgreSQL tenant-isolation integration suite

`tenantIsolation.ts` is a destructive integration gate that creates and drops a
disposable database. It migrates the database from zero, provisions the runtime
roles, registers two real clubs through `POST /auth/register`, authenticates Club
A through `POST /auth/login`, and exercises the production Express routes with
foreign identifiers owned by Club B.

Run it with a superuser maintenance URL (the database named in the URL is never
dropped):

```bash
MIGRATION_GATE_DATABASE_URL=postgres://postgres:postgres@localhost/postgres \
  npm run db:tenant-isolation:integration
```

The gate also executes `db/tests/runtime_rls_negative.sql` after fixtures exist,
under `SET LOCAL ROLE miclub_runtime`, including its no-`app.club_id` checks.
Every negative HTTP response must be a safe 403, 404, or 409. Finally, an
administrator connection compares complete JSON snapshots of all Club B rows;
the test fails if any cross-tenant request changed a row.

## Public registration provisioning

`publicRegistration.ts` creates a separate database, migrates it from zero and
confirms that it contains no clubs before exercising the real
`POST /auth/register` route. It first forces provisioning to fail after its
first insert and verifies a complete rollback. It then verifies the person,
user, club, FREE subscription, onboarding, complete role catalog, Director
membership/employee, payment methods and the three system sectors.

```bash
MIGRATION_GATE_DATABASE_URL=postgres://postgres:postgres@localhost/postgres \
  npm run db:public-registration:integration
```

## Empty-database first-club journey

`emptyDatabaseJourney.test.ts` only accepts `MICLUB_TEST_DATABASE_URL` when its
database name explicitly contains `test`. It creates a randomly named database,
runs the real migration runner from zero, verifies the migration ledger and
global catalogs, and drops that database in teardown. The API is pointed only at
that disposable database while it exercises health, first-club registration,
login, `/auth/me`, empty dashboards, onboarding, catalogs and logout.

When the variable is absent, Node reports the test as skipped with the explicit
reason that no shared or production database will be used:

```bash
MICLUB_TEST_DATABASE_URL=postgres://postgres:postgres@localhost/miclub_test \
  npm run test:integration:empty-db -w @miclub/api
```
