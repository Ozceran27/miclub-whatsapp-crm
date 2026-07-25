-- Diagnóstico de importaciones (solo lectura). Ejecutar como un único script en DBeaver.
-- No cancela sesiones, no toma locks explícitos y no modifica datos.

-- 1. Batches recientes tenant-scoped y métricas almacenadas en notes.
select id, club_id, source, status, started_at, finished_at,
       round(extract(epoch from (coalesce(finished_at, now()) - started_at))::numeric, 3) as duration_seconds,
       case when notes like '{%' then notes::jsonb ->> 'read' end as rows_read,
       case when notes like '{%' then notes::jsonb ->> 'errors' end as errors,
       case when notes like '{%' then jsonb_array_length(coalesce(notes::jsonb -> 'warnings', '[]'::jsonb)) end as warnings
  from miclub.import_batches
 order by started_at desc
 limit 50;

-- 2. Ejecuciones activas o posiblemente stale (más de 15 minutos).
select id, club_id, status, started_at, now() - started_at as age,
       (started_at < now() - interval '15 minutes') as stale
  from miclub.import_batches
 where status in ('pending', 'running')
 order by started_at;

-- 3. Actividad, transacciones abiertas y esperas del servidor.
select pid, application_name, usename, state, xact_start, query_start,
       now() - query_start as query_age, wait_event_type, wait_event,
       left(query, 500) as query
  from pg_stat_activity
 where datname = current_database()
 order by xact_start nulls last, query_start;

-- 4. Locks y bloqueadores (vacío significa que no se detectaron bloqueos).
select blocked.pid as blocked_pid, pg_blocking_pids(blocked.pid) as blocking_pids,
       blocked.wait_event_type, blocked.wait_event, now() - blocked.query_start as blocked_for,
       left(blocked.query, 500) as blocked_query
  from pg_stat_activity blocked
 where cardinality(pg_blocking_pids(blocked.pid)) > 0;

-- 5. Errores recientes, sin exponer raw_payload ni datos personales fuente.
select ie.id, ie.club_id, ie.batch_id, ie.source_table, ie.source_row,
       left(ie.error_message, 500) as error_message, ie.created_at
  from miclub.import_errors ie
 order by ie.created_at desc
 limit 100;

-- 6. Invariantes multi-tenant.
select 'import_batches_without_club' as check_name, count(*) as failures from miclub.import_batches where club_id is null
union all
select 'import_errors_without_club', count(*) from miclub.import_errors where club_id is null;

-- 7. Resumen PASS/FAIL.
select case when
  not exists (select 1 from miclub.import_batches where club_id is null)
  and not exists (select 1 from miclub.import_errors where club_id is null)
  and not exists (select 1 from miclub.import_batches where status = 'running' and started_at < now() - interval '15 minutes')
  and not exists (select 1 from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and xact_start < now() - interval '5 minutes')
then 'PASS' else 'FAIL' end as import_diagnostic_summary;
