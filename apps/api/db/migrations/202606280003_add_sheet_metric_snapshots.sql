begin;

create table if not exists miclub.sheet_metric_snapshots (
  metric_key text not null,
  metric_value numeric(14,2),
  captured_at timestamptz not null default now(),
  source text not null default 'google_sheets',
  source_range text,
  source_payload jsonb,
  primary key (metric_key, captured_at)
);

create index if not exists sheet_metric_snapshots_metric_captured_idx
  on miclub.sheet_metric_snapshots (metric_key, captured_at desc);

commit;
