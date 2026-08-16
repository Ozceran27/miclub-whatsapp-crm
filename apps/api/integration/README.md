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

