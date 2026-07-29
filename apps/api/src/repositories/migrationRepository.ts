import type { QueryExecutor } from "../db/postgres.js";

export type MissingEnrollmentCandidate = { id: string; dependency_reason: string | null };

export const isCompletedGoogleSheetsImport = async (executor: QueryExecutor, importId: string, clubId: string): Promise<boolean> => {
  const result = await executor.query<{ id: string }>(
    "select id from miclub.import_batches where id = $1 and club_id = $2 and source = 'google_sheets' and status in ('completed', 'completed_with_errors')",
    [importId, clubId],
  );
  return result.rows.length > 0;
};

export const lockMissingEnrollments = async (executor: QueryExecutor, enrollmentIds: string[], importId: string, clubId: string): Promise<MissingEnrollmentCandidate[]> => {
  const result = await executor.query<MissingEnrollmentCandidate>(
    `select e.id,
            case
              when exists (select 1 from miclub.payment_allocations pa join miclub.receivables r on r.id = pa.receivable_id where r.enrollment_id = e.id)
                then 'La inscripción tiene pagos asociados y se conserva para no romper la integridad histórica.'
              when exists (select 1 from miclub.receivables r where r.enrollment_id = e.id)
                then 'La inscripción tiene cuentas por cobrar asociadas y se conserva para no romper la integridad histórica.'
              when exists (select 1 from miclub.crm_message_history cmh where cmh.enrollment_id = e.id)
                then 'La inscripción tiene historial de mensajes asociado y se conserva para no romper la integridad histórica.'
              else null
            end as dependency_reason
       from miclub.enrollments e
      where e.id = any($1::uuid[]) and e.club_id = $3 and e.source = 'google_sheets' and e.missing_from_import_batch_id = $2
      for update`,
    [enrollmentIds, importId, clubId],
  );
  return result.rows;
};

export const archiveMissingEnrollments = async (executor: QueryExecutor, enrollmentIds: string[], importId: string, clubId: string): Promise<string[]> => {
  const result = await executor.query<{ id: string }>(
    `update miclub.enrollments
        set inactive = true,
            inactive_at = coalesce(inactive_at, now()),
            inactive_reason = 'missing_from_google_sheets_import',
            superseded_at = coalesce(superseded_at, now()),
            superseded_reason = 'missing_from_google_sheets_import',
            status = 'cancelado'::miclub.enrollment_status,
            updated_at = now()
      where id = any($1::uuid[]) and club_id = $3 and source = 'google_sheets' and missing_from_import_batch_id = $2
      returning id`,
    [enrollmentIds, importId, clubId],
  );
  return result.rows.map((row) => row.id);
};
