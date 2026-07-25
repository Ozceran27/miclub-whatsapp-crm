/* miClub — diagnóstico forense SOLO LECTURA. PostgreSQL/DBeaver.
   Resultado esperado: schema miclub presente; una cadena user/person/membership/club/role.
   Este archivo no abre transacción ni ejecuta DDL/DML. */
SELECT current_database() database_name, current_user database_user, version();
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_schema='miclub' ORDER BY table_name;
SELECT table_name, column_name, data_type FROM information_schema.columns
 WHERE table_schema='miclub' AND (column_name='club_id' OR table_name IN ('users','people','clubs','user_club_memberships','roles'))
 ORDER BY table_name, ordinal_position;

SELECT * FROM miclub.users WHERE lower(email)=lower('miclub.posadas@gmail.com');
SELECT * FROM miclub.people WHERE normalized_dni='35004264' OR lower(email)=lower('miclub.posadas@gmail.com');
SELECT * FROM miclub.clubs WHERE lower(name)=lower('miClub') OR lower(email)=lower('miclub.posadas@gmail.com');
SELECT u.id user_id, p.id person_id, m.id membership_id, m.status membership_status,
       c.id club_id, c.name club_name, r.id role_id, r.code role_code, m.permissions
  FROM miclub.users u
  LEFT JOIN miclub.user_club_memberships m ON m.user_id=u.id
  LEFT JOIN miclub.clubs c ON c.id=m.club_id
  LEFT JOIN miclub.roles r ON r.id=m.role_id AND r.club_id=m.club_id
  LEFT JOIN miclub.people p ON p.user_id=u.id AND p.club_id=m.club_id
 WHERE lower(u.email)=lower('miclub.posadas@gmail.com');

SELECT 'duplicate_user_email' issue, lower(email) key, count(*) rows FROM miclub.users GROUP BY lower(email) HAVING count(*)>1
UNION ALL SELECT 'duplicate_person_dni', club_id||':'||normalized_dni, count(*) FROM miclub.people WHERE normalized_dni IS NOT NULL GROUP BY club_id,normalized_dni HAVING count(*)>1
UNION ALL SELECT 'duplicate_membership', user_id||':'||club_id, count(*) FROM miclub.user_club_memberships GROUP BY user_id,club_id HAVING count(*)>1;
SELECT * FROM miclub.user_club_memberships WHERE status<>'active';

/* Inventario universal de columnas tenant y FKs: sirve para detectar tablas reales sin asumirlas. */
SELECT c.table_name,
       (SELECT count(*) FROM information_schema.columns x WHERE x.table_schema='miclub' AND x.table_name=c.table_name) column_count
  FROM information_schema.columns c WHERE c.table_schema='miclub' AND c.column_name='club_id' ORDER BY c.table_name;
SELECT tc.table_name, kcu.column_name, ccu.table_name referenced_table, ccu.column_name referenced_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_catalog,constraint_schema,constraint_name)
  JOIN information_schema.constraint_column_usage ccu USING (constraint_catalog,constraint_schema,constraint_name)
 WHERE tc.table_schema='miclub' AND tc.constraint_type='FOREIGN KEY' ORDER BY tc.table_name,kcu.column_name;

/* Nulos/club inválido y conteos para todas las tablas tenant se generan sin modificar datos.
   Copie el valor de generated_readonly_query y ejecútelo como una segunda sentencia en DBeaver. */
SELECT string_agg(format(
 'SELECT %L table_name,count(*) total,count(*) FILTER (WHERE club_id IS NULL) without_club,count(*) FILTER (WHERE club_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM miclub.clubs c WHERE c.id=t.club_id)) invalid_club FROM miclub.%I t',
 table_name,table_name), E' UNION ALL\n') generated_readonly_query
FROM information_schema.columns WHERE table_schema='miclub' AND column_name='club_id';

/* Relaciones tenant cruzadas conocidas. El resultado esperado es cero filas. */
SELECT 'enrollment_person' relation,e.id child_id,e.club_id child_club,p.club_id parent_club FROM miclub.enrollments e JOIN miclub.people p ON p.id=e.person_id WHERE e.club_id IS DISTINCT FROM p.club_id
UNION ALL SELECT 'enrollment_activity',e.id,e.club_id,a.club_id FROM miclub.enrollments e JOIN miclub.activities a ON a.id=e.activity_id WHERE e.club_id IS DISTINCT FROM a.club_id
UNION ALL SELECT 'activity_sector',a.id,a.club_id,s.club_id FROM miclub.activities a JOIN miclub.sectors s ON s.id=a.sector_id WHERE a.club_id IS DISTINCT FROM s.club_id
UNION ALL SELECT 'import_error_batch',ie.id,ie.club_id,ib.club_id FROM miclub.import_errors ie JOIN miclub.import_batches ib ON ib.id=ie.import_batch_id WHERE ie.club_id IS DISTINCT FROM ib.club_id;
