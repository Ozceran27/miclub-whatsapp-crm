-- miClub - modalidades de pago y roles operativos tenant-scoped
-- PostgreSQL / DBeaver
--
-- IMPORTANTE
-- 1. Ejecutar primero y por separado el BLOQUE 1 (auditoría de solo lectura).
-- 2. Ejecutar el BLOQUE 2 únicamente si invalidos_para_migrar = 0 y el detalle no devuelve filas.
-- 3. Si cualquier sentencia del BLOQUE 2 falla, ejecutar ROLLBACK; antes de volver a intentarlo.
-- 4. salary se conserva temporalmente para lectores legacy. Las escrituras nuevas deben usar
--    payment_mode y monthly_fixed_amount.

-- ============================================================================
-- BLOQUE 1 - AUDITORÍA (solo lectura)
-- ============================================================================

select
  count(*)                                                     as total_empleados,
  count(*) filter (where salary is null)                       as sin_salario,
  count(*) filter (where salary is not null and salary >= 0)   as migrables_a_fixed,
  count(*) filter (
    where salary < 0 or salary > 999999999999.99
  )                                                            as invalidos_para_migrar,
  min(salary)                                                  as salario_minimo,
  max(salary)                                                  as salario_maximo
from miclub.employees;

select id, club_id, person_id, salary
from miclub.employees
where salary < 0
   or salary > 999999999999.99
order by club_id, id;

-- Diagnóstico de la clave real de roles. En el esquema actual debe aparecer el índice
-- único funcional roles_club_code_key sobre (club_id, lower(code)).
select indexname, indexdef
from pg_indexes
where schemaname = 'miclub'
  and tablename = 'roles'
order by indexname;

-- ============================================================================
-- BLOQUE 2 - APLICACIÓN TRANSACCIONAL
-- Ejecutar completo, desde BEGIN hasta COMMIT.
-- ============================================================================

begin;

-- Evita carreras con otra provisión de roles ejecutada al mismo tiempo.
lock table miclub.roles in share row exclusive mode;

alter table miclub.employees
  add column if not exists payment_mode text;

alter table miclub.employees
  add column if not exists monthly_fixed_amount numeric(14,2);

-- Gate dentro de la misma transacción: una auditoría anterior no basta si los datos
-- cambiaron entre ambos bloques.
do $audit_gate$
begin
  if exists (
    select 1
    from miclub.employees
    where salary < 0
       or salary > 999999999999.99
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'AUDIT_GATE_FAILED: salary contiene valores fuera del rango permitido; no se migró ninguna fila';
  end if;
end
$audit_gate$;

-- Migración explícita y reejecutable:
-- salary con valor => FIXED con el mismo valor; salary NULL => VARIABLE sin monto.
-- No sobrescribe filas que ya tengan una modalidad definida.
update miclub.employees
set payment_mode = case when salary is null then 'VARIABLE' else 'FIXED' end,
    monthly_fixed_amount = case when salary is null then null else salary end
where payment_mode is null;

-- Si hubiera quedado una ejecución manual parcial anterior, fallar con un mensaje claro
-- antes de intentar instalar la constraint.
do $payment_gate$
begin
  if exists (
    select 1
    from miclub.employees
    where payment_mode is null
       or payment_mode not in ('FIXED', 'VARIABLE')
       or (payment_mode = 'FIXED' and (monthly_fixed_amount is null or monthly_fixed_amount < 0))
       or (payment_mode = 'VARIABLE' and monthly_fixed_amount is not null)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PAYMENT_GATE_FAILED: existen payment_mode/monthly_fixed_amount incoherentes; ejecute ROLLBACK y audite esas filas';
  end if;
end
$payment_gate$;

alter table miclub.employees
  alter column payment_mode set not null;

alter table miclub.employees
  drop constraint if exists employees_payment_mode_amount_check;

alter table miclub.employees
  add constraint employees_payment_mode_amount_check check (
    (payment_mode = 'FIXED' and monthly_fixed_amount is not null and monthly_fixed_amount >= 0)
    or
    (payment_mode = 'VARIABLE' and monthly_fixed_amount is null)
  );

comment on column miclub.employees.payment_mode is
  'Modalidad de pago laboral: FIXED o VARIABLE.';
comment on column miclub.employees.monthly_fixed_amount is
  'Monto mensual no negativo, obligatorio solo para FIXED y nulo para VARIABLE.';
comment on column miclub.employees.salary is
  'COMPATIBILIDAD TEMPORAL: no escribir; retirar solo después de migrar todos los lectores.';

-- Roles tenant-scoped.
-- El índice real es funcional: (club_id, lower(code)). Por eso NO se utiliza
-- ON CONFLICT (club_id, code), que PostgreSQL rechaza con 42P10.
-- UPDATE + INSERT WHERE NOT EXISTS funciona con esa clave funcional y también en
-- instalaciones que todavía no tengan una constraint inferible por ON CONFLICT.
with role_values(code, name, description) as (
  values
    ('TRABAJADOR'::text, 'Trabajador'::text, 'Acceso laboral mínimo del club'::text),
    ('INSTRUCTOR'::text, 'Instructor'::text, 'Acceso mínimo a actividades e inscripciones del club'::text)
)
update miclub.roles as role
set name = value.name,
    description = value.description,
    code = value.code
from role_values as value
where lower(role.code) = lower(value.code);

with role_values(code, name, description) as (
  values
    ('TRABAJADOR'::text, 'Trabajador'::text, 'Acceso laboral mínimo del club'::text),
    ('INSTRUCTOR'::text, 'Instructor'::text, 'Acceso mínimo a actividades e inscripciones del club'::text)
)
insert into miclub.roles (club_id, code, name, description)
select club.id, value.code, value.name, value.description
from miclub.clubs as club
cross join role_values as value
where not exists (
  select 1
  from miclub.roles as existing
  where existing.club_id = club.id
    and lower(existing.code) = lower(value.code)
);

-- Matriz cerrada de privilegio mínimo. Nunca se copian permisos de DIRECTOR.
update miclub.user_club_memberships as membership
set permissions = case upper(role.code)
    when 'TRABAJADOR' then array[
      'dashboard:read',
      'tasks.view'
    ]::text[]
    when 'INSTRUCTOR' then array[
      'dashboard:read',
      'sectors.view',
      'activities.view',
      'tasks.view',
      'enrollments.view'
    ]::text[]
  end,
  updated_at = now()
from miclub.roles as role
where role.id = membership.role_id
  and role.club_id = membership.club_id
  and upper(role.code) in ('TRABAJADOR', 'INSTRUCTOR');

commit;

-- ============================================================================
-- BLOQUE 3 - VERIFICACIÓN POSTERIOR DE SOLO LECTURA
-- Todas las consultas de incumplimientos deben devolver cero filas.
-- ============================================================================

select id, club_id, payment_mode, monthly_fixed_amount
from miclub.employees
where payment_mode not in ('FIXED', 'VARIABLE')
   or (payment_mode = 'FIXED' and (monthly_fixed_amount is null or monthly_fixed_amount < 0))
   or (payment_mode = 'VARIABLE' and monthly_fixed_amount is not null);

select club_id, upper(code) as role_code, count(*) as cantidad
from miclub.roles
where upper(code) in ('TRABAJADOR', 'INSTRUCTOR')
group by club_id, upper(code)
having count(*) <> 1;

select role.club_id, role.code, membership.id as membership_id, membership.permissions
from miclub.roles as role
join miclub.user_club_memberships as membership
  on membership.role_id = role.id
 and membership.club_id = role.club_id
where upper(role.code) in ('TRABAJADOR', 'INSTRUCTOR')
  and membership.permissions && array[
    'club:manage',
    'users:manage',
    'workers.manage',
    'administration.configure',
    'sectors:any'
  ]::text[];

-- Debe devolver exactamente dos filas por club, una para cada código.
select club_id, upper(code) as role_code, name, description
from miclub.roles
where upper(code) in ('TRABAJADOR', 'INSTRUCTOR')
order by club_id, role_code;
