-- Adds safe archival markers for Google Sheets enrollment reconciliation.
-- Missing rows from the latest import can be marked inactive/superseded without
-- losing historical enrollment data or forcing an operational status change.

alter table if exists miclub.enrollments
  add column if not exists inactive boolean not null default false,
  add column if not exists inactive_reason text,
  add column if not exists inactive_at timestamptz,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_reason text;

create index if not exists enrollments_google_sheets_active_idx
  on miclub.enrollments (source, external_id)
  where source = 'google_sheets' and inactive = false and superseded_at is null;
