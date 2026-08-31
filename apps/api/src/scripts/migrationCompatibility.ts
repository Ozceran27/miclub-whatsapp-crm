/**
 * Installation-only repairs for frozen historical migrations.
 *
 * Their stored SQL/checksum must not be edited because deployed databases have
 * already registered it. On a fresh install PostgreSQL is stricter than the old
 * development database: CREATE OR REPLACE cannot reorder columns or insert one
 * in the middle of a view. These transforms only run when the migration has not
 * yet been registered and preserve the canonical checksum in the ledger.
 */
export const prepareMigrationSql = (name: string, sql: string): string => {
  if (name === "202606270001_align_existing_miclub_for_sheets_import.sql") {
    return sql.replace(
      "create or replace view miclub.v_dashboard_basic as",
      "drop view if exists miclub.v_dashboard_basic;\ncreate view miclub.v_dashboard_basic as",
    );
  }

  if (name === "202606280003_fix_pending_and_receivable_normalization.sql") {
    return sql.replace(
      "create or replace view miclub.v_enrollment_receivable_fees as",
      "drop view if exists miclub.v_dashboard_basic;\ndrop view if exists miclub.v_enrollment_receivable_fees;\ncreate view miclub.v_enrollment_receivable_fees as",
    );
  }

  return sql;
};
