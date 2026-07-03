begin;

create table if not exists miclub.activity_fee_history (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references miclub.activities(id) on delete cascade,
  previous_monthly_fee numeric(14,2),
  new_monthly_fee numeric(14,2) not null,
  source text not null default 'google_sheets_import',
  raw_fee_amount_text text,
  raw_fee_amount numeric(14,2),
  normalization_reason text,
  import_batch_id uuid references miclub.import_batches(id),
  changed_at timestamptz not null default now()
);

create index if not exists activity_fee_history_activity_changed_idx
  on miclub.activity_fee_history (activity_id, changed_at desc);

comment on table miclub.activity_fee_history is
  'Audita cambios de cuota mensual de actividades, especialmente correcciones de importes normalizados desde Google Sheets.';
comment on column miclub.activity_fee_history.previous_monthly_fee is 'Cuota mensual anterior de miclub.activities.monthly_fee.';
comment on column miclub.activity_fee_history.new_monthly_fee is 'Nueva cuota mensual aplicada a miclub.activities.monthly_fee.';
comment on column miclub.activity_fee_history.normalization_reason is 'Razon de normalizacion usada por el importador para aceptar la cuota nueva.';

create table if not exists miclub.activity_fee_cleanup_candidates (
  activity_id uuid primary key references miclub.activities(id) on delete cascade,
  activity_monthly_fee numeric(14,2) not null,
  max_normalized_enrollment_fee numeric(14,2) not null,
  active_enrollments_count integer not null,
  detected_at timestamptz not null default now()
);

comment on table miclub.activity_fee_cleanup_candidates is
  'Actividades cuya cuota mensual es mayor que las cuotas normalizadas actuales de sus inscripciones activas; revisar antes de corregir.';

insert into miclub.activity_fee_cleanup_candidates (activity_id, activity_monthly_fee, max_normalized_enrollment_fee, active_enrollments_count, detected_at)
select
  a.id,
  a.monthly_fee,
  max(coalesce(e.normalized_fee_amount, miclub.normalize_enrollment_fee_amount(e.fee_amount)))::numeric(14,2) as max_normalized_enrollment_fee,
  count(*)::integer as active_enrollments_count,
  now()
from miclub.activities a
join miclub.enrollments e on e.activity_id = a.id
where coalesce((to_jsonb(e)->>'inactive')::boolean, false) = false
  and to_jsonb(e)->>'superseded_at' is null
  and e.status not in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)
group by a.id, a.monthly_fee
having a.monthly_fee > max(coalesce(e.normalized_fee_amount, miclub.normalize_enrollment_fee_amount(e.fee_amount)))
on conflict (activity_id) do update
set activity_monthly_fee = excluded.activity_monthly_fee,
    max_normalized_enrollment_fee = excluded.max_normalized_enrollment_fee,
    active_enrollments_count = excluded.active_enrollments_count,
    detected_at = excluded.detected_at;

commit;
