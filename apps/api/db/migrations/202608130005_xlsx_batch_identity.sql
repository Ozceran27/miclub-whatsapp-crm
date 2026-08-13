begin;

alter table miclub.import_batches
  add column if not exists batch_identity text,
  add column if not exists operation_type text;

alter table miclub.import_batches drop constraint if exists import_batches_operation_type_check;
alter table miclub.import_batches add constraint import_batches_operation_type_check
  check (operation_type is null or operation_type in ('dry_run','apply','retry','reversal'));

create unique index if not exists import_batches_exact_real_batch_uidx
  on miclub.import_batches(club_id,batch_identity)
  where source='xlsx' and operation_type='apply' and status='completed';

comment on column miclub.import_batches.batch_identity is
  'SHA-256 sobre hash del archivo, versión de plantilla, tenant y tipo de operación.';
comment on column miclub.import_batches.operation_type is
  'Distingue dry-run, aplicación real y las operaciones explícitas retry/reversal.';

commit;
