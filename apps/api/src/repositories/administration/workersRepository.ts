import { getPostgresPool } from "../../db/postgres.js";

type WorkerRow = {
  id: string;
  club_id: string;
  person_id: string;
  code: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  dni: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  sector: string | null;
  salary: string | number | null;
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
  const exists = await pool.query<{ employees: string | null }>("select to_regclass('miclub.employees')::text as employees");
  const hasEmployees = Boolean(exists.rows[0]?.employees);

  const result = hasEmployees
    ? await pool.query<WorkerRow>(`
        select e.id::text, e.club_id::text, e.person_id::text, null::text as code,
          p.first_name, p.last_name, p.dni, p.phone, p.email,
          coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Sin nombre') as display_name,
          coalesce(e.position, r.name) as role, s.name as sector, e.salary, e.status,
          (e.user_id is not null and ucm.status = 'active' and coalesce(u.is_active, false) and u.status = 'active') as system_access,
          e.employment_start_date::text, e.employment_end_date::text, e.notes,
          coalesce(ucm.permissions, '{}'::text[]) as permissions,
          case when e.sector_id is null then '{}'::uuid[] else array[e.sector_id] end::text[] as sector_ids,
          coalesce(activities.items, '[]'::json) as activities,
          count(*) filter (where lower(coalesce(e.position, r.code, r.name, '')) = 'director' and e.status = 'active') over() as active_director_count,
          e.created_at::text, e.updated_at::text,
          count(*) over() as total_count
        from miclub.employees e
        join miclub.people p on p.id = e.person_id and p.club_id = e.club_id
        left join miclub.sectors s on s.id = e.sector_id and s.club_id = e.club_id
        left join miclub.user_club_memberships ucm on ucm.id = e.membership_id and ucm.club_id = e.club_id
        left join miclub.roles r on r.id = ucm.role_id and r.club_id = e.club_id
        left join miclub.users u on u.id = e.user_id
        left join miclub.instructors i on i.person_id = e.person_id and i.club_id = e.club_id
        left join lateral (
          select json_agg(json_build_object('id', a.id::text, 'name', a.name, 'status', a.status) order by a.name) as items
          from miclub.activities a where a.club_id = e.club_id and a.instructor_id = i.id and a.archived_at is null
        ) activities on true
        where e.club_id = $1 and e.archived_at is null
        order by p.last_name, p.first_name, e.id
        limit $2 offset $3`, [clubId, limit, offset])
    : await pool.query<WorkerRow>(`
        select p.id::text, p.club_id::text, p.id::text as person_id, null::text as code,
          p.first_name, p.last_name, p.dni, p.phone, p.email,
          coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), i.display_name, 'Sin nombre') as display_name,
          coalesce(r.name, case when i.id is not null then 'Instructor' end) as role,
          sectors.names as sector, null::numeric as salary,
          case when coalesce(ucm.status, 'active') = 'active' and p.status::text in ('activa', 'active') then 'active' else 'inactive' end as status,
          (ucm.status = 'active' and coalesce(u.is_active, false) and u.status = 'active') as system_access,
          null::text as employment_start_date, null::text as employment_end_date, null::text as notes,
          coalesce(ucm.permissions, '{}'::text[]) as permissions, coalesce(ucm.sector_ids, '{}'::uuid[])::text[] as sector_ids,
          coalesce(activities.items, '[]'::json) as activities,
          count(*) filter (where lower(coalesce(r.code, r.name, '')) = 'director' and ucm.status = 'active') over() as active_director_count,
          p.created_at::text, p.updated_at::text,
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
};
