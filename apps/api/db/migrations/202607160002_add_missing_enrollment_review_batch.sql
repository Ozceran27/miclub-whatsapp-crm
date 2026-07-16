-- Scope of an explicit, post-import reconciliation review.  It is deliberately
-- separate from `source`: only Google Sheets rows selected by a completed
-- import can be deleted through the review endpoint.
alter table if exists miclub.enrollments
  add column if not exists missing_from_import_batch_id uuid
  references miclub.import_batches(id) on delete set null;

create index if not exists enrollments_missing_review_batch_idx
  on miclub.enrollments (missing_from_import_batch_id)
  where missing_from_import_batch_id is not null;
