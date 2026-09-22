import { getPostgresPool } from "../../db/postgres.js";
import { withTenantTransaction } from "../../db/transaction.js";
import { hasActivityResponsibleEmployee } from "../../db/schemaCapabilities.js";

type WorkerRow = {
  id: string;
  club_id: string;
  person_id: string;
  photo_file_id: string | null;
  code: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  dni: string | null;
  phone: string | null;
  contact_email: string | null;
  account_email: string | null;
  role: string | null;
  sector: string | null;
  salary: string | number | null;
  has_fixed_compensation: boolean;
  fixed_compensation_amount: string | number | null;
  fixed_compensation_frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null;
  fixed_compensation_effective_from: string | null;
  currency_code: "ARS" | "USD" | "BRL" | "EUR" | null;
  status: string;
  system_access: boolean;
  employment_start_date: string | null;
  employment_end_date: string | null;
  notes: string | null;
  permissions: string[];
  sector_ids: string[];
  activities: Array<{ id: string; name: string; status: string }>;
  active_director_count: string | number;
  created_at: string;
  updated_at: string;
  version: string;
  total_count: string | number;
};

export type WorkersPage = {
  rows: WorkerRow[];
  total: number;
  dataSource: "employees" | "legacy";
  limitations: string[];
};

const LEGACY_LIMITATIONS = [
  "La instalación no posee miclub.employees: salario y fecha de ingreso no están disponibles.",
  "El rol proviene de la membresía o se infiere como Instructor; el sector se infiere de los permisos de la membresía o de sus actividades."
];

export const getWorkersPage = async (clubId: string, limit: number, offset: number): Promise<WorkersPage> => {
  const pool = await getPostgresPool();
  return withTenantTransaction(clubId,async db=>{
  const exists = await db.query<{ employees: string | null }>("select to_regclass('miclub.employees')::text as employees");
  const hasEmployees = Boolean(exists.rows[0]?.employees);
  const hasCanonicalResponsibility = hasEmployees && await hasActivityResponsibleEmployee(db);
  const activityOwnerPredicate = hasCanonicalResponsibility
    ? "(a.responsible_employee_id = e.id or (a.responsible_employee_id is null and a.instructor_id = i.id))"
    : "a.instructor_id = i.id";

  const result = hasEmployees
    ? await db.query<WorkerRow>(`
        select e.id::text, e.club_id::text, e.person_id::text,
          (select ep.id::text from miclub.employee_photos ep where ep.club_id=e.club_id and ep.employee_id=e.id and ep.status='active' and ep.deleted_at is null order by ep.updated_at desc,ep.id limit 1) as photo_file_id,
          null::text as code,
          p.first_name, p.last_name, p.dni, p.phone, p.email as contact_email, u.email::text as account_email,
          coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Sin nombre') as display_name,
          coalesce(r.code, upper(e.position)) as role, s.name as sector, e.salary, e.has_fixed_compensation, e.fixed_compensation_amount, e.fixed_compensation_frequency, e.currency_code,
          compensation.effective_from::text as fixed_compensation_effective_from, e.status,
          (e.user_id is not null and ucm.status = 'active' and coalesce(u.is_active, false) and u.status = 'active') as system_access,
          e.employment_start_date::text, e.employment_end_date::text, e.notes,
          coalesce(ucm.permissions, '{}'::text[]) as permissions,
          case when e.sector_id is null then '{}'::uuid[] else array[e.sector_id] end::text[] as sector_ids,
          coalesce(activities.items, '[]'::json) as activities,
          count(*) filter (where coalesce(r.code, upper(e.position)) = 'DIRECTOR' and e.status = 'active' and (ucm.id is null or ucm.status = 'active')) over() as active_director_count,
          e.created_at::text, e.updated_at::text, e.updated_at::text as version,
          count(*) over() as total_count
        from miclub.employees e
        join miclub.people p on p.id = e.person_id and p.club_id = e.club_id
        left join miclub.sectors s on s.id = e.sector_id and s.club_id = e.club_id
        left join miclub.user_club_memberships ucm on ucm.id = e.membership_id and ucm.club_id = e.club_id
        left join miclub.roles r on r.id = ucm.role_id and r.club_id = e.club_id
        left join miclub.users u on u.id = e.user_id
        left join miclub.instructors i on i.person_id = e.person_id and i.club_id = e.club_id
        left join lateral (
          select t.effective_from from miclub.employee_compensation_terms t
          where t.club_id=e.club_id and t.employee_id=e.id and t.effective_to is null
          order by t.effective_from desc,t.id limit 1
        ) compensation on true
        left join lateral (
          select json_agg(json_build_object('id', a.id::text, 'name', a.name, 'status', a.status) order by a.name) as items
          from miclub.activities a
          where a.club_id = e.club_id
            and ${activityOwnerPredicate}
            and a.archived_at is null
        ) activities on true
        where e.club_id = $1 and e.archived_at is null
        order by p.last_name, p.first_name, e.id
        limit $2 offset $3`, [clubId, limit, offset])
    : await db.query<WorkerRow>(`
        select p.id::text, p.club_id::text, p.id::text as person_id, null::text as photo_file_id, null::text as code,
          p.first_name, p.last_name, p.dni, p.phone, p.email as contact_email, u.email::text as account_email,
          coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), i.display_name, 'Sin nombre') as display_name,
          coalesce(r.code, case when i.id is not null then 'INSTRUCTOR' end) as role,
          sectors.names as sector, null::numeric as salary, false as has_fixed_compensation, null::numeric as fixed_compensation_amount, null::text as fixed_compensation_frequency, null::text as currency_code, null::text as fixed_compensation_effective_from,
          case when coalesce(ucm.status, 'active') = 'active' and p.status::text in ('activa', 'active') then 'active' else 'inactive' end as status,
          (ucm.status = 'active' and coalesce(u.is_active, false) and u.status = 'active') as system_access,
          null::text as employment_start_date, null::text as employment_end_date, null::text as notes,
          coalesce(ucm.permissions, '{}'::text[]) as permissions, coalesce(ucm.sector_ids, '{}'::uuid[])::text[] as sector_ids,
          coalesce(activities.items, '[]'::json) as activities,
          count(*) filter (where r.code = 'DIRECTOR' and ucm.status = 'active') over() as active_director_count,
          p.created_at::text, p.updated_at::text, p.updated_at::text as version,
          count(*) over() as total_count
        from miclub.people p
        left join miclub.instructors i on i.person_id = p.id and i.club_id = p.club_id
        left join miclub.user_club_memberships ucm on ucm.user_id = p.user_id and ucm.club_id = p.club_id
        left join miclub.roles r on r.id = ucm.role_id and r.club_id = p.club_id
        left join miclub.users u on u.id = p.user_id
        left join lateral (
          select json_agg(json_build_object('id', a.id::text, 'name', a.name, 'status', a.status) order by a.name) as items
          from miclub.activities a where a.club_id = p.club_id and a.instructor_id = i.id and a.archived_at is null
        ) activities on true
        left join lateral (
          select string_agg(distinct s.name, ', ' order by s.name) as names
          from miclub.sectors s
          where s.club_id = p.club_id and (
            s.id = any(coalesce(ucm.sector_ids, '{}'::uuid[])) or exists (
              select 1 from miclub.activities a where a.club_id = p.club_id and a.sector_id = s.id and a.instructor_id = i.id
            )
          )
        ) sectors on true
        where p.club_id = $1 and (i.id is not null or ucm.id is not null)
        order by p.last_name, p.first_name, p.id
        limit $2 offset $3`, [clubId, limit, offset]);

  return {
    rows: result.rows,
    total: Number(result.rows[0]?.total_count ?? 0),
    dataSource: hasEmployees ? "employees" : "legacy",
    limitations: hasEmployees ? [] : LEGACY_LIMITATIONS
  };
  },pool);
};
