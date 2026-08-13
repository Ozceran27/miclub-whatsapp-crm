-- READ ONLY. Ejecutar y revisar antes de clasificar cualquier egreso histórico.
-- El diagnóstico no infiere pagos por nombre/categoría: expone evidencia para decisión humana.
select
  m.club_id,
  m.activity_id,
  a.name as activity_name,
  a.sector_id,
  m.category_id,
  coalesce(mc.name, '(sin categoría)') as category_name,
  m.movement_type,
  m.operational_status,
  count(*) as movement_count,
  sum(m.amount) as total_amount,
  min(m.movement_date) as first_occurrence,
  max(m.movement_date) as last_occurrence
from miclub.movements m
join miclub.activities a on a.id = m.activity_id and a.club_id = m.club_id
left join miclub.movement_categories mc on mc.id = m.category_id and mc.club_id = m.club_id
where m.movement_type = 'EGRESOS'
group by m.club_id, m.activity_id, a.name, a.sector_id, m.category_id, mc.name,
         m.movement_type, m.operational_status
order by m.club_id, a.name, total_amount desc;

-- Filas candidatas para revisión. Ninguna debe migrarse hasta asignarle explícitamente
-- PAYMENT, ADVANCE o SETTLEMENT_ADJUSTMENT y documentar la decisión.
select m.id, m.club_id, m.activity_id, a.name as activity_name, m.movement_date,
       m.amount, m.operational_status, mc.name as category_name, m.concept
from miclub.movements m
join miclub.activities a on a.id = m.activity_id and a.club_id = m.club_id
left join miclub.movement_categories mc on mc.id = m.category_id and mc.club_id = m.club_id
where m.movement_type = 'EGRESOS'
order by m.club_id, m.activity_id, m.movement_date, m.id;
