begin;

create table if not exists miclub.xlsx_import_rows (
  club_id uuid not null references miclub.clubs(id) on delete cascade,
  batch_id uuid not null references miclub.import_batches(id) on delete cascade,
  sheet text not null check (sheet in ('ADMINISTRACIÓN','INSCRIPCIONES')),
  row_fingerprint text not null check (row_fingerprint ~ '^[0-9a-f]{64}$'),
  external_reference text,
  source_row_number integer not null check (source_row_number >= 2),
  entity_id uuid not null,
  imported_at timestamptz not null default now(),
  primary key (club_id,batch_id,sheet,row_fingerprint),
  unique (club_id,batch_id,sheet,source_row_number)
);

create index if not exists xlsx_import_rows_external_reference_idx
  on miclub.xlsx_import_rows(club_id,sheet,external_reference)
  where external_reference is not null;

alter table miclub.xlsx_import_rows enable row level security;
alter table miclub.xlsx_import_rows force row level security;
drop policy if exists xlsx_import_rows_tenant_isolation on miclub.xlsx_import_rows;
create policy xlsx_import_rows_tenant_isolation on miclub.xlsx_import_rows
  using (club_id = nullif(current_setting('app.club_id',true),'')::uuid)
  with check (club_id = nullif(current_setting('app.club_id',true),'')::uuid);

comment on table miclub.xlsx_import_rows is
  'Claves versionadas, no PII, de cada fila XLSX efectivamente importada.';
comment on column miclub.xlsx_import_rows.entity_id is
  'Entidad creada; sin FK polimórfica porque sheet determina movements o enrollments.';

commit;
