-- Secure XLSX import metadata. This migration runs after app_users was renamed
-- to miclub.users by 202607250002_evolve_app_users_auth.sql.
begin;

do $$
begin
  if to_regclass('miclub.users') is null then
    raise exception using
      errcode = '42P01',
      message = 'Falta miclub.users; ejecute primero 202607250002_evolve_app_users_auth.sql';
  end if;
end $$;

alter table miclub.import_batches
  add column if not exists file_sha256 text,
  add column if not exists template_version text,
  add column if not exists uploaded_by uuid,
  add column if not exists dry_run_of_batch_id uuid references miclub.import_batches(id),
  add column if not exists row_count integer not null default 0,
  add column if not exists error_count integer not null default 0,
  add column if not exists warning_count integer not null default 0,
  add column if not exists projected_writes integer not null default 0,
  add column if not exists persisted_writes integer not null default 0,
  add column if not exists idempotency_key text,
  add column if not exists reference_config_hash text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'import_batches_uploaded_by_fkey'
      and conrelid = 'miclub.import_batches'::regclass
  ) then
    alter table miclub.import_batches
      add constraint import_batches_uploaded_by_fkey
      foreign key (uploaded_by) references miclub.users(id) on delete set null;
  end if;
end $$;

create unique index if not exists import_batches_idempotency_unique
  on miclub.import_batches(club_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists import_batches_secure_dry_run_lookup
  on miclub.import_batches(club_id, file_sha256, template_version, reference_config_hash, status);

alter table miclub.import_errors
  add column if not exists error_code text,
  add column if not exists sheet text,
  add column if not exists entity_type text,
  add column if not exists field text,
  add column if not exists value_normalized text;

comment on column miclub.import_batches.uploaded_by is
  'Usuario que cargó el XLSX; referencia miclub.users y se conserva nula si la cuenta se elimina.';
comment on column miclub.import_batches.dry_run_of_batch_id is
  'Dry-run exitoso y equivalente que autorizó este import real.';

commit;
