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

-- 5.a. Top del batch original. Reemplazar únicamente el UUID entre comillas.
-- La presencia masiva de 25P02 demuestra el efecto cascada; la primera fila
-- cronológica anterior a esos errores contiene la causa de datos real.
with selected_batch as (
  select nullif('PEGAR_BATCH_ID_AQUI', 'PEGAR_BATCH_ID_AQUI')::uuid as id
), classified as (
  select ie.*,
         case
           when error_message ilike '%25P02%' or error_message ilike '%current transaction is aborted%' then 'TRANSACTION_ABORTED'
           when error_message ilike '%invalid%date%' or error_message ilike '%fecha%inválid%' then 'INVALID_DATE'
           when error_message ilike '%not-null%' or error_message ilike '%sin nombre%' then 'REQUIRED_FIELD'
           when error_message ilike '%foreign key%' then 'FOREIGN_KEY'
           when error_message ilike '%duplicate%' or error_message ilike '%unique constraint%' then 'DUPLICATE_EXTERNAL_ID'
           when error_message ilike '%sector%' then 'UNKNOWN_SECTOR'
           when error_message ilike '%activit%' or error_message ilike '%actividad%' then 'UNKNOWN_ACTIVITY'
           else 'ROW_IMPORT_ERROR'
         end as error_code
    from miclub.import_errors ie join selected_batch b on b.id = ie.batch_id
)
select error_code, left(error_message, 300) as message,
       split_part(source_row, ':', 1) as sheet, source_table as entity_type,
       count(*) as quantity
  from classified
 group by 1, 2, 3, 4
 order by quantity desc, error_code;

-- 5.b. Primeros 20 errores en orden (sin raw_payload sensible).
with selected_batch as (select nullif('PEGAR_BATCH_ID_AQUI', 'PEGAR_BATCH_ID_AQUI')::uuid as id)
select ie.id, ie.club_id, ie.source_table as entity_type,
       split_part(ie.source_row, ':', 1) as sheet,
       split_part(ie.source_row, ':', 2) as row_number,
       left(ie.error_message, 500) as message, ie.created_at
  from miclub.import_errors ie join selected_batch b on b.id = ie.batch_id
 order by ie.created_at, ie.id limit 20;

-- 5.c. Verifica que batch y errores pertenezcan a un único tenant.
with selected_batch as (select nullif('PEGAR_BATCH_ID_AQUI', 'PEGAR_BATCH_ID_AQUI')::uuid as id)
select b.id, b.club_id as batch_club_id, count(ie.*) as errors,
       count(*) filter (where ie.club_id is distinct from b.club_id) as wrong_tenant_errors
  from miclub.import_batches b join selected_batch sb on sb.id = b.id
  left join miclub.import_errors ie on ie.batch_id = b.id
 group by b.id, b.club_id;

-- 5.d. External IDs duplicados dentro de un club (debe devolver cero filas).
select 'movements' as entity, club_id, external_id, count(*)
  from miclub.movements group by club_id, external_id having count(*) > 1
union all
select 'enrollments', club_id, external_id, count(*)
  from miclub.enrollments group by club_id, external_id having count(*) > 1;

-- 5.e. Integridad tenant de relaciones principales (conteos deben ser cero).
select 'movement_sector_cross_tenant' check_name, count(*) failures
  from miclub.movements m join miclub.sectors s on s.id = m.sector_id where s.club_id is distinct from m.club_id
union all select 'enrollment_activity_cross_tenant', count(*)
  from miclub.enrollments e join miclub.activities a on a.id = e.activity_id where a.club_id is distinct from e.club_id
union all select 'enrollment_person_cross_tenant', count(*)
  from miclub.enrollments e join miclub.people p on p.id = e.person_id where p.club_id is distinct from e.club_id;

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
