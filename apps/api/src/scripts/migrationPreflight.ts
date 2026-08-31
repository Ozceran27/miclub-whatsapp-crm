import type { QueryExecutor } from "../db/postgres.js";

type CountRow = { count: string | number };

export const assertMigrationLedgerCompatible = async (executor: QueryExecutor): Promise<void> => {
  const [ledger, schema] = await Promise.all([
    executor.query<{ ledger: string | null }>("select to_regclass('public.miclub_schema_migrations')::text as ledger"),
    executor.query<CountRow>(`
      select count(*)::integer as count
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'miclub' and c.relkind in ('r','p','v','m','S','f')
    `),
  ]);
  const ledgerExists = ledger.rows[0]?.ledger != null;
  const schemaObjects = Number(schema.rows[0]?.count ?? 0);
  const ledgerEntries = ledgerExists
    ? Number((await executor.query<CountRow>("select count(*)::integer as count from public.miclub_schema_migrations")).rows[0]?.count ?? 0)
    : 0;

  if (schemaObjects > 0 && ledgerEntries === 0) {
    throw new Error(
      "La base ya contiene un esquema miclub administrado manualmente, pero el ledger public.miclub_schema_migrations está ausente o vacío. "
      + "db:migrate no debe reproducir el historial sobre una base existente. No borres vistas ni inventes entradas del ledger: "
      + "continúa con el procedimiento manual o realiza una adopción/reconciliación auditada por DBA.",
    );
  }
};
