import { getPostgresPool } from "../../db/postgres.js";
import { completedMovementPredicate } from "../movementPredicates.js";

export type AdministrationEnrollmentSummaryRow = {
  active: number;
  up_to_date: number;
  new_enrollments: number;
  owing: number;
  abandoned: number;
};

export type AdministrationCapacitySummaryRow = {
  total_capacity: string | number | null;
  occupied: string | number | null;
};

export type AdministrationEntityTotalsRow = {
  workers: number;
  users: number;
  roles: number;
  active_activities: number;
};

export type AdministrationTopActivityRow = {
  id: string;
  label: string;
  enrollments: number;
};

export type AdministrationGrowthRow = {
  period: string;
  enrollments: number;
  income: string | number | null;
  expenses: string | number | null;
  balance: string | number | null;
  movements: number;
};

export type AdministrationSummaryRows = {
  enrollments: AdministrationEnrollmentSummaryRow;
  capacity: AdministrationCapacitySummaryRow;
  entities: AdministrationEntityTotalsRow;
  topActivities: AdministrationTopActivityRow[];
  growth: AdministrationGrowthRow[];
};

export const getAdministrationSummaryRows = async (
  clubId: string,
  previousStart: Date,
  currentStart: Date,
  currentEnd: Date,
): Promise<AdministrationSummaryRows> => {
  const pool = await getPostgresPool();
  const [enrollmentsResult, capacityResult, entitiesResult, topActivitiesResult, growthResult] = await Promise.all([
    pool.query<AdministrationEnrollmentSummaryRow>(`
      select
        count(*) filter (where eos.effective_status not in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status))::integer as active,
        count(*) filter (where eos.effective_status = 'al_dia'::miclub.enrollment_status)::integer as up_to_date,
        count(*) filter (where eos.effective_status = 'nuevo_inscripto'::miclub.enrollment_status)::integer as new_enrollments,
        count(*) filter (where eos.effective_status = 'adeudando'::miclub.enrollment_status)::integer as owing,
        count(*) filter (where eos.effective_status = 'abandonado'::miclub.enrollment_status)::integer as abandoned
      from miclub.enrollments e
      join miclub.v_enrollment_lifecycle_v2 eos on eos.enrollment_id = e.id and eos.club_id = e.club_id
      where e.club_id = $1
        and coalesce(e.inactive, false) = false
        and e.superseded_at is null
    `, [clubId]),
    pool.query<AdministrationCapacitySummaryRow>(`
      with activity_capacity as (
        select coalesce(sum(a.max_capacity) filter (where a.max_capacity is not null and a.status = 'activa'::miclub.entity_status), 0) as total_capacity
        from miclub.activities a
        where a.club_id = $1 and a.archived_at is null
      ), occupied as (
        select count(*) as occupied
        from miclub.enrollments e
        join miclub.v_enrollment_lifecycle_v2 eos on eos.enrollment_id = e.id and eos.club_id = e.club_id
        where e.club_id = $1
          and coalesce(e.inactive, false) = false
          and e.superseded_at is null
          and eos.effective_status not in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)
      )
      select activity_capacity.total_capacity, occupied.occupied from activity_capacity cross join occupied
    `, [clubId]),
    pool.query<AdministrationEntityTotalsRow>(`
      select
        (select count(*)::integer from miclub.employees where club_id = $1 and status = 'active') as workers,
        (select count(distinct user_id)::integer from miclub.user_club_memberships where club_id = $1 and status = 'active') as users,
        (select count(*)::integer from miclub.roles where club_id = $1) as roles,
        (select count(*)::integer from miclub.activities where club_id = $1 and status = 'activa'::miclub.entity_status and archived_at is null) as active_activities
    `, [clubId]),
    pool.query<AdministrationTopActivityRow>(`
      select a.id::text, a.name as label, count(e.id)::integer as enrollments
      from miclub.activities a
      left join miclub.enrollments e on e.activity_id = a.id and e.club_id = a.club_id
      left join miclub.v_enrollment_lifecycle_v2 eos on eos.enrollment_id = e.id and eos.club_id = e.club_id
      where a.club_id = $1
        and a.status = 'activa'::miclub.entity_status
        and a.archived_at is null
        and (e.id is null or (coalesce(e.inactive, false) = false and e.superseded_at is null and eos.effective_status not in ('abandonado'::miclub.enrollment_status, 'cancelado'::miclub.enrollment_status)))
      group by a.id, a.name
      order by enrollments desc, a.name asc
      limit 3
    `, [clubId]),
    pool.query<AdministrationGrowthRow>(`
      with months as (
        select $2::timestamptz as month_start, $3::timestamptz as month_end
        union all
        select $3::timestamptz, $4::timestamptz
      )
      select
        to_char(months.month_start at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') as period,
        coalesce((select count(*)::integer from miclub.enrollments e where e.club_id = $1 and coalesce(e.inactive, false) = false and e.superseded_at is null and coalesce(e.enrollment_date, e.start_date) >= (months.month_start at time zone 'America/Argentina/Buenos_Aires')::date and coalesce(e.enrollment_date, e.start_date) < (months.month_end at time zone 'America/Argentina/Buenos_Aires')::date), 0) as enrollments,
        coalesce(sum(m.amount) filter (where m.movement_type = 'INGRESOS'), 0) as income,
        coalesce(sum(m.amount) filter (where m.movement_type = 'EGRESOS'), 0) as expenses,
        coalesce(sum(case when m.movement_type = 'INGRESOS' then m.amount when m.movement_type = 'EGRESOS' then -m.amount else 0 end), 0) as balance,
        count(m.id)::integer as movements
      from months
      left join miclub.movements m on m.club_id = $1 and m.movement_date >= months.month_start and m.movement_date < months.month_end and ${completedMovementPredicate("m")}
      group by months.month_start, months.month_end
      order by months.month_start
    `, [clubId, previousStart, currentStart, currentEnd]),
  ]);

  return {
    enrollments: enrollmentsResult.rows[0] ?? { active: 0, up_to_date: 0, new_enrollments: 0, owing: 0, abandoned: 0 },
    capacity: capacityResult.rows[0] ?? { total_capacity: 0, occupied: 0 },
    entities: entitiesResult.rows[0] ?? { workers: 0, users: 0, roles: 0, active_activities: 0 },
    topActivities: topActivitiesResult.rows,
    growth: growthResult.rows,
  };
};
