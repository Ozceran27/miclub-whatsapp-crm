create table miclub.onboarding_operations (
  club_id uuid not null references miclub.clubs(id) on delete cascade,
  operation text not null check (operation in ('COMPLETE_ONBOARDING')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  contract_version integer not null check (contract_version > 0),
  result jsonb,
  created_by uuid not null references miclub.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (club_id, operation),
  unique (club_id, operation, idempotency_key)
);
alter table miclub.import_batches add column onboarding_completion_key text;
alter table miclub.onboarding_operations enable row level security;
alter table miclub.onboarding_operations force row level security;
create policy onboarding_operations_tenant on miclub.onboarding_operations using (club_id = nullif(current_setting('app.club_id',true),'')::uuid) with check (club_id = nullif(current_setting('app.club_id',true),'')::uuid);
grant select,insert,update on miclub.onboarding_operations to miclub_runtime;
grant update(onboarding_completion_key) on miclub.import_batches to miclub_runtime;
