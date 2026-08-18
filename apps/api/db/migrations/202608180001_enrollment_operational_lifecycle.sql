-- Canonical enrollment lifecycle derived from enrollment date and completed fee payments.
alter table miclub.enrollments add column if not exists modality text;
alter table miclub.enrollments add column if not exists status_override boolean not null default false;

comment on column miclub.enrollments.modality is 'Free text belonging to this enrollment; it is not activity identity.';
comment on column miclub.enrollments.status_override is 'When true, effective status remains the stored status until an operator clears the override.';

create or replace function miclub.sync_activity_enrollment_fee()
returns trigger language plpgsql security invoker set search_path = pg_catalog, miclub as $$
begin
  if new.monthly_fee is distinct from old.monthly_fee then
    update miclub.enrollments
       set fee_amount = new.monthly_fee, normalized_fee_amount = new.monthly_fee,
           fee_normalization_reason = 'activity_fee_sync', fee_normalized_at = now(), updated_at = now()
     where club_id = new.club_id and activity_id = new.id and status <> 'cancelado';
  end if;
  return new;
end $$;

drop trigger if exists activities_sync_enrollment_fee on miclub.activities;
create trigger activities_sync_enrollment_fee after update of monthly_fee on miclub.activities
for each row execute function miclub.sync_activity_enrollment_fee();

create or replace function miclub.assert_activity_has_instructor()
returns trigger language plpgsql security invoker set search_path = pg_catalog, miclub as $$
begin
  if new.archived_at is null and new.status::text = 'activa' and new.instructor_id is null then
    raise exception 'An active activity must have exactly one instructor' using errcode = '23502';
  end if;
  return new;
end $$;

drop trigger if exists activities_require_instructor on miclub.activities;
create constraint trigger activities_require_instructor after insert or update of instructor_id, status, archived_at on miclub.activities
deferrable initially deferred for each row execute function miclub.assert_activity_has_instructor();

-- A payment is a completed income linked to the person. activity_id narrows it
-- when supplied; legacy payments without it apply only to that person's sole
-- active enrollment, avoiding accidental cross-activity renewals.
create or replace view miclub.v_enrollment_lifecycle_v2 as
with payment_candidates as (
  select e.id enrollment_id, max(m.movement_date)::date payment_last_payment_at
  from miclub.enrollments e
  join miclub.activities payment_activity on payment_activity.id=e.activity_id and payment_activity.club_id=e.club_id
  join miclub.movements m on m.club_id=e.club_id and m.person_id=e.person_id
    and m.movement_type='INGRESOS'::miclub.movement_type
    and m.operational_status='COMPLETADO'::miclub.movement_status
    and m.voided_at is null
    and (m.activity_id=e.activity_id or (m.activity_id is null and (m.sector_id=payment_activity.sector_id or 1=(select count(*) from miclub.enrollments sibling where sibling.club_id=e.club_id and sibling.person_id=e.person_id and sibling.status<>'cancelado'))))
  group by e.id
), facts as (
  -- Never select e.* here: legacy installations already contain
  -- enrollments.last_payment_at, which made last_payment_at ambiguous (42702).
  select e.id, e.club_id, e.status, e.status_override,
    coalesce(e.enrollment_date,e.created_at::date) enrollment_date,
    p.payment_last_payment_at,
    coalesce(p.payment_last_payment_at,e.enrollment_date,e.created_at::date) anchor_date
  from miclub.enrollments e left join payment_candidates p on p.enrollment_id=e.id
)
select f.id enrollment_id, f.club_id, f.status stored_status,
  case
    when f.status_override or f.status='cancelado' then f.status
    when current_date <= f.enrollment_date + 10 then 'nuevo_inscripto'::miclub.enrollment_status
    when f.payment_last_payment_at is not null and current_date <= f.payment_last_payment_at + 30 then 'al_dia'::miclub.enrollment_status
    when current_date >= f.anchor_date + 62 then 'abandonado'::miclub.enrollment_status
    else 'adeudando'::miclub.enrollment_status
  end effective_status,
  f.payment_last_payment_at last_payment_at,
  (f.anchor_date + 30) due_date,
  greatest(0, floor(greatest(0,current_date-f.anchor_date-1)::numeric/30))::integer overdue_installments,
  f.status_override
from facts f;

comment on view miclub.v_enrollment_lifecycle_v2 is
'Operational truth: new through day 10; paid through day 30; abandoned at day 62; overdue installment count never accumulates money.';

create or replace view miclub.v_enrollment_receivable_fees as
select e.id enrollment_id, life.effective_status status, life.due_date, e.fee_amount,
  coalesce(e.normalized_fee_amount,miclub.normalize_enrollment_fee_amount(e.fee_amount)) normalized_fee_amount,
  s.name sector_name, a.name activity_name, commission.rate commission_rate,
  case when life.effective_status in ('abandonado','cancelado') then 0::numeric
       else coalesce(e.normalized_fee_amount,miclub.normalize_enrollment_fee_amount(e.fee_amount))*commission.rate end receivable_fee
from miclub.enrollments e
join miclub.v_enrollment_lifecycle_v2 life on life.enrollment_id=e.id and life.club_id=e.club_id
join miclub.activities a on a.id=e.activity_id and a.club_id=e.club_id
join miclub.sectors s on s.id=a.sector_id and s.club_id=e.club_id
cross join lateral (select case
  when upper(regexp_replace(coalesce(s.code,s.name,''),'[^[:alnum:]]+','_','g')) in ('FITNESS','ESPACIO_FITNESS') then .5::numeric
  when upper(regexp_replace(coalesce(s.code,s.name,''),'[^[:alnum:]]+','_','g'))='AULA' then greatest(0::numeric,least(1::numeric,case when coalesce(a.club_commission_percent,0)>1 then a.club_commission_percent/100 else coalesce(a.club_commission_percent,0) end))
  else 0::numeric end rate) commission;
