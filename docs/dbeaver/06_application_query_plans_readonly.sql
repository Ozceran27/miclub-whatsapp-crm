/* miClub — planes reales de lecturas críticas. SOLO LECTURA, sin DDL ni DML.
   Ejecutar MANUALMENTE en una réplica o entorno seguro con estadísticas y volumen
   representativos. Reemplazar el UUID antes de ejecutar el script completo.
   Guardar la salida de cada EXPLAIN para comparar antes/después; no crear índices
   a partir de intuiciones ni de un plan ejecutado contra una base vacía. */
ROLLBACK;
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '2s';
SET LOCAL miclub.audit_club_id = '00000000-0000-0000-0000-000000000000'; -- REEMPLAZAR

-- Inventario obligatorio previo: índices, constraints y tamaño/estadísticas reales.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'miclub'
ORDER BY tablename, indexname;

SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE connamespace = 'miclub'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT relname, n_live_tup, n_dead_tup, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'miclub'
ORDER BY relname;

-- HOME: KPIs de movimientos por tenant y período.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT count(*) AS movements, coalesce(sum(amount), 0) AS amount
FROM miclub.movements
WHERE club_id = current_setting('miclub.audit_club_id')::uuid
  AND movement_date >= date_trunc('month', current_date);

-- ECONOMÍA: agregado mensual que alimenta gráficos y resumen.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT date_trunc('month', movement_date) AS month, movement_type,
       count(*) AS movements, sum(amount) AS amount
FROM miclub.v_movements_enriched
WHERE club_id = current_setting('miclub.audit_club_id')::uuid
  AND movement_date >= current_date - interval '12 months'
GROUP BY 1, 2 ORDER BY 1, 2;

-- MOVIMIENTOS: primera página con el orden y límite del endpoint administrativo.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT *, count(*) OVER () AS total_count
FROM miclub.v_movements_enriched
WHERE club_id = current_setting('miclub.audit_club_id')::uuid
ORDER BY movement_date DESC NULLS LAST, created_at DESC NULLS LAST, id DESC NULLS LAST
LIMIT 50 OFFSET 0;

-- PERSONAS: búsqueda explícita equivalente al endpoint (cambiar el término).
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT people.id, people.first_name, people.last_name, people.dni, people.phone,
       people.normalized_phone, people.email, people.notes, people.created_at,
       people.updated_at, people.club_id, people.user_id, people.normalized_dni,
       count(*) OVER () AS total_count
FROM miclub.people AS people
WHERE people.club_id = current_setting('miclub.audit_club_id')::uuid
  AND concat_ws(' ', people.first_name, people.last_name, people.dni,
      people.normalized_dni, people.phone, people.normalized_phone,
      people.email, people.notes) ILIKE '%PRUEBA%'
ORDER BY people.id LIMIT 50 OFFSET 0;

-- INSCRIPCIONES: activas por tenant con sus relaciones principales.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT e.id, e.person_id, e.activity_id, e.status, e.enrollment_date
FROM miclub.enrollments e
JOIN miclub.people p ON p.id = e.person_id AND p.club_id = e.club_id
JOIN miclub.activities a ON a.id = e.activity_id AND a.club_id = e.club_id
WHERE e.club_id = current_setting('miclub.audit_club_id')::uuid
  AND e.status NOT IN ('abandonado', 'cancelado')
ORDER BY e.enrollment_date DESC NULLS LAST, e.id
LIMIT 50;

-- CRM: historial reciente tenant-scoped.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT * FROM (
  SELECT * FROM miclub.crm_message_history
  WHERE club_id = current_setting('miclub.audit_club_id')::uuid
  ORDER BY created_at DESC LIMIT 200
) recent
ORDER BY created_at DESC LIMIT 20 OFFSET 0;

ROLLBACK;

/* Decisión posterior (fuera de este archivo): comparar actual time, rows,
   loops, shared hit/read, sorts y estimado/real con el inventario anterior.
   Sólo una carencia repetible en planes representativos justifica proponer DDL. */
