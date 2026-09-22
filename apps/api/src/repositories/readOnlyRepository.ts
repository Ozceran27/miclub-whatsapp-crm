import { tenantExecutor } from "../db/transaction.js";
import { hasActivityResponsibleEmployee } from "../db/schemaCapabilities.js";

export type ReadOnlyRow = Record<string, unknown>;

export type PageQuery = {
  clubId: string;
  limit: number;
  offset: number;
  filters: Record<string, string | undefined>;
  /** Undefined means sectors:any; an empty array intentionally returns no sector rows. */
  sectorIds?: readonly string[];
};

export type ReadOnlyPage = {
  rows: ReadOnlyRow[];
  total: number;
};

type FilterDefinition = {
  column: string;
  operator?: "=" | "ilike" | ">=" | "<=";
  cast?: string;
};

type ListDefinition = {
  from: string;
  clubColumn: string;
  select: string;
  orderBy: string;
  filters: Record<string, FilterDefinition>;
  baseWhere?: string;
  sectorColumn?: string;
};

const textSearch = (columns: string[]): FilterDefinition => ({
  column: `concat_ws(' ', ${columns.join(", ")})`,
  operator: "ilike"
});

const listDefinitions = {
  sectores: {
    sectorColumn: "s.id",
    clubColumn: "s.club_id",
    select: `s.id, s.manager_person_id, s.code, s.name, s.description, s.icon_key, s.color, s.opening_time, s.closing_time,
      s.max_capacity, s.capacity_mode, s.configured_capacity,
      capacity.maximum_capacity, capacity.current_usage, capacity.utilization_percentage,
      capacity.idle_percentage, capacity.data_status as capacity_data_status,
      s.municipal_status, s.financial_status, s.operational_status, s.status,
      s.uses_enrollments, s.uses_activities, s.notes, s.created_at, s.updated_at,
      nullif(trim(concat_ws(' ', manager.first_name, manager.last_name)), '') as manager_name,
      (select count(*)::integer from miclub.activities a
        where a.club_id = s.club_id and a.sector_id = s.id
          and a.status = 'activa'::miclub.entity_status and a.archived_at is null) as activities_count,
      (select count(*)::integer from miclub.enrollments e
        join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
        where e.club_id = s.club_id and a.sector_id = s.id
          and e.status in ('al_dia', 'nuevo_inscripto', 'adeudando')) as active_enrollments_count,
      profitability.amount::float8 as annual_operating_profitability,
      profitability.status as annual_operating_profitability_status,
      extract(year from (now() at time zone coalesce(nullif(trim(club.timezone), ''), 'America/Argentina/Buenos_Aires')))::integer as annual_operating_profitability_year,
      club.base_currency_code as operating_currency_code,
      s.is_system`,
    from: `miclub.sectors s
      join miclub.clubs club on club.id=s.club_id
      left join miclub.people manager on manager.id = s.manager_person_id and manager.club_id = s.club_id
      left join miclub.v_sector_capacity_metrics capacity on capacity.club_id=s.club_id and capacity.sector_id=s.id
      left join lateral (
        select
          case when count(*) filter (
            where coalesce(movement.currency_code, club.base_currency_code) <> club.base_currency_code and rate.id is null
          ) > 0 then null else coalesce(sum(
            (case when movement.movement_type = 'INGRESOS' then 1 else -1 end) * abs(
              case
                when coalesce(movement.currency_code, club.base_currency_code) = club.base_currency_code then movement.amount
                when rate.base_currency_code = movement.currency_code and rate.quote_currency_code = club.base_currency_code then movement.amount * rate.rate
                when rate.quote_currency_code = movement.currency_code and rate.base_currency_code = club.base_currency_code then movement.amount / rate.rate
              end
            )
          ), 0) end as amount,
          case when count(*) filter (
            where coalesce(movement.currency_code, club.base_currency_code) <> club.base_currency_code and rate.id is null
          ) > 0 then 'INCOMPLETE_EXCHANGE_RATE' else 'AVAILABLE' end as status
        from miclub.movements movement
        join miclub.movement_categories category on category.id = movement.category_id and category.club_id = movement.club_id
        join miclub.category_catalog catalog on catalog.id = category.catalog_id
        left join lateral (
          select exchange_rate.* from miclub.exchange_rates exchange_rate
          where exchange_rate.rate_date <= movement.movement_date::date and exchange_rate.rate_type = 'official'
            and ((exchange_rate.base_currency_code = movement.currency_code and exchange_rate.quote_currency_code = club.base_currency_code)
              or (exchange_rate.quote_currency_code = movement.currency_code and exchange_rate.base_currency_code = club.base_currency_code))
          order by exchange_rate.rate_date desc, exchange_rate.created_at desc limit 1
        ) rate on movement.currency_code is distinct from club.base_currency_code
        where movement.club_id = s.club_id and movement.sector_id = s.id
          and movement.operational_status = 'COMPLETADO'
          and movement.movement_type in ('INGRESOS', 'EGRESOS')
          and catalog.classification = 'OPERATIONAL'
          and movement.movement_date >= make_timestamptz(
            extract(year from (now() at time zone coalesce(nullif(trim(club.timezone), ''), 'America/Argentina/Buenos_Aires')))::integer,
            1, 1, 0, 0, 0,
            coalesce(nullif(trim(club.timezone), ''), 'America/Argentina/Buenos_Aires'))
          and movement.movement_date < now()
      ) profitability on true`,
    orderBy: "s.name asc, s.id asc",
    baseWhere: "s.archived_at is null",
    filters: {
      search: textSearch(["s.code", "s.name", "s.notes"]),
      status: { column: "s.status" },
      usesEnrollments: { column: "s.uses_enrollments", cast: "boolean" },
      usesActivities: { column: "s.uses_activities", cast: "boolean" }
    }
  },
  actividades: {
    sectorColumn: "a.sector_id",
    from: `miclub.activities a
      join miclub.clubs activity_club on activity_club.id=a.club_id
      left join miclub.sectors s on s.id = a.sector_id and s.club_id = a.club_id
      left join miclub.instructors i on i.id = a.instructor_id and i.club_id = a.club_id
      left join miclub.employees responsible_employee on responsible_employee.id=a.responsible_employee_id and responsible_employee.club_id=a.club_id
      left join miclub.people operational_responsible on operational_responsible.id=responsible_employee.person_id and operational_responsible.club_id=a.club_id
      left join miclub.people manager on manager.id = a.manager_person_id and manager.club_id = a.club_id
      left join lateral (select t.mode, t.fixed_club_fee, t.fixed_fee_frequency, t.currency_code, t.club_share_percentage, t.responsible_person_id, t.effective_from, t.effective_to from miclub.activity_terms t where t.club_id=a.club_id and t.activity_id=a.id and (now() at time zone coalesce(nullif(trim(activity_club.timezone),''),'America/Argentina/Buenos_Aires'))::date between t.effective_from and coalesce(t.effective_to, 'infinity'::date) order by t.effective_from desc limit 1) terms on true
      left join miclub.people responsible on responsible.id=terms.responsible_person_id and responsible.club_id=a.club_id
      left join lateral (select p.id,p.enrollment_price,p.fee_price,p.fee_frequency,p.currency_code,p.effective_from
        from miclub.activity_price_terms p where p.club_id=a.club_id and p.activity_id=a.id
          and (now() at time zone coalesce(nullif(trim(activity_club.timezone),''),'America/Argentina/Buenos_Aires'))::date
            between p.effective_from and coalesce(p.effective_to,'infinity'::date)
        order by p.effective_from desc limit 1) price on true
      left join lateral (
        select case when count(movement.id)=0 then null
          when count(*) filter (where coalesce(movement.currency_code,activity_club.base_currency_code)<>activity_club.base_currency_code and rate.id is null)>0 then null
          else coalesce(sum((case when movement.movement_type='INGRESOS' then 1 else -1 end)*abs(case
            when coalesce(movement.currency_code,activity_club.base_currency_code)=activity_club.base_currency_code then movement.amount
            when rate.base_currency_code=movement.currency_code and rate.quote_currency_code=activity_club.base_currency_code then movement.amount*rate.rate
            when rate.quote_currency_code=movement.currency_code and rate.base_currency_code=activity_club.base_currency_code then movement.amount/rate.rate end)),0) end amount,
          count(movement.id)::integer movements,
          case when count(movement.id)=0 then 'NO_MOVEMENTS'
            when count(*) filter (where coalesce(movement.currency_code,activity_club.base_currency_code)<>activity_club.base_currency_code and rate.id is null)>0 then 'INCOMPLETE_EXCHANGE_RATE'
            else 'AVAILABLE' end status
        from miclub.movements movement
        join miclub.movement_categories category on category.id=movement.category_id and category.club_id=movement.club_id
        join miclub.category_catalog catalog on catalog.id=category.catalog_id
        left join lateral (select exchange_rate.* from miclub.exchange_rates exchange_rate
          where exchange_rate.rate_date<=movement.movement_date::date and exchange_rate.rate_type='official'
            and ((exchange_rate.base_currency_code=movement.currency_code and exchange_rate.quote_currency_code=activity_club.base_currency_code)
              or (exchange_rate.quote_currency_code=movement.currency_code and exchange_rate.base_currency_code=activity_club.base_currency_code))
          order by exchange_rate.rate_date desc,exchange_rate.created_at desc limit 1) rate on movement.currency_code is distinct from activity_club.base_currency_code
        where movement.club_id=a.club_id and movement.activity_id=a.id and movement.operational_status='COMPLETADO'
          and movement.movement_type in ('INGRESOS','EGRESOS') and catalog.classification='OPERATIONAL'
          and movement.movement_date>=make_timestamptz(extract(year from (now() at time zone coalesce(nullif(trim(activity_club.timezone),''),'America/Argentina/Buenos_Aires')))::integer,1,1,0,0,0,coalesce(nullif(trim(activity_club.timezone),''),'America/Argentina/Buenos_Aires'))
          and movement.movement_date<now()
      ) activity_profitability on true`,
    clubColumn: "a.club_id",
    select: `a.id, a.sector_id, s.name as sector_name, a.manager_person_id,
      nullif(trim(concat_ws(' ', manager.first_name, manager.last_name)), '') as manager_name, a.instructor_id,
      i.display_name as instructor_name, a.responsible_employee_id, nullif(trim(concat_ws(' ', operational_responsible.first_name, operational_responsible.last_name)), '') as responsible_employee_name,
       terms.responsible_person_id, nullif(trim(concat_ws(' ', responsible.first_name, responsible.last_name)), '') as responsible_person_name, a.code, a.name, a.modality, a.color, a.icon_key, a.monthly_fee as enrollment_fee, a.monthly_fee,
       (price.id is not null) as pricing_configured, price.enrollment_price::float8, price.fee_price::float8,
       price.fee_frequency, price.currency_code as price_currency_code, price.effective_from as price_effective_from,
       coalesce((select json_agg(json_build_object('id',schedule.id,'weekday',schedule.weekday,'startTime',to_char(schedule.start_time,'HH24:MI'),'endTime',to_char(schedule.end_time,'HH24:MI')) order by schedule.weekday,schedule.start_time)
         from miclub.activity_schedules schedule where schedule.club_id=a.club_id and schedule.activity_id=a.id),'[]'::json) as schedules,
      a.club_commission_percent, a.instructor_commission_percent, a.max_capacity,
      lower(terms.mode) as settlement_mode, terms.fixed_club_fee as settlement_fixed_amount, terms.fixed_fee_frequency, terms.currency_code,
      terms.club_share_percentage, terms.effective_from as terms_effective_from, terms.effective_to as terms_effective_to, a.generates_enrollments,
      activity_profitability.amount::float8 as annual_operating_profitability,
      activity_profitability.status as annual_operating_profitability_status,
      activity_profitability.movements as annual_operating_movements,
      extract(year from (now() at time zone coalesce(nullif(trim(activity_club.timezone),''),'America/Argentina/Buenos_Aires')))::integer as annual_operating_profitability_year,
      activity_club.base_currency_code as operating_currency_code,
      (select count(*)::integer from miclub.enrollments e where e.club_id = a.club_id
        and e.activity_id = a.id and e.status in ('al_dia', 'nuevo_inscripto', 'adeudando')) as current_enrollments,
      a.status, a.notes, a.created_at, a.updated_at`,
    orderBy: "a.name asc, a.id asc",
    baseWhere: "a.archived_at is null",
    filters: {
      search: textSearch(["a.code", "a.name", "a.modality", "a.notes", "s.name", "i.display_name", "operational_responsible.first_name", "operational_responsible.last_name"]),
      sectorId: { column: "a.sector_id", cast: "uuid" },
      status: { column: "a.status" },
      modality: { column: "a.modality" }
    }
  },
  trabajadores: {
    from: `miclub.people p
      join miclub.person_kind_links pkl on pkl.person_id = p.id and pkl.club_id = p.club_id
      left join miclub.instructors i on i.person_id = p.id and i.club_id = p.club_id`,
    clubColumn: "p.club_id",
    select: `p.id, p.first_name, p.last_name, p.dni, p.phone, p.normalized_phone, p.email,
      p.notes, p.created_at, p.updated_at, p.user_id, p.normalized_dni,
      array_agg(distinct pkl.kind::text order by pkl.kind::text) as kinds,
      max(i.id::text) as instructor_id, max(i.display_name) as instructor_name`,
    orderBy: "p.last_name asc, p.first_name asc, p.id asc",
    baseWhere: "pkl.kind in ('empleado'::miclub.person_kind, 'encargado'::miclub.person_kind, 'instructor'::miclub.person_kind)",
    filters: {
      search: textSearch(["p.first_name", "p.last_name", "p.dni", "p.normalized_dni", "p.phone", "p.normalized_phone", "p.email", "p.notes", "i.display_name"]),
      kind: { column: "pkl.kind", cast: "miclub.person_kind" }
    }
  },
  movimientos: {
    sectorColumn: "m.sector_id",
    from: "miclub.v_movements_enriched m join miclub.movements movement_sequence on movement_sequence.club_id=m.club_id and movement_sequence.id=m.id",
    clubColumn: "m.club_id",
    select: `m.id, movement_sequence.sequence_number, m.external_id, m.movement_date, m.movement_type, m.category_id, m.category,
      m.sector_id, m.sector_code, m.sector_name, movement_sequence.activity_id, m.concept, m.person_id, m.first_name,
      m.last_name, m.dni, m.counterparty_text, m.amount, m.taxes, m.payment_method_id,
      m.payment_method, m.financial_status, m.operational_status, m.source,
      m.source_payload, m.created_at, m.updated_at`,
    orderBy: "m.movement_date desc nulls last, m.id desc",
    filters: {
      search: textSearch(["m.concept", "m.counterparty_text", "m.first_name", "m.last_name", "m.dni", "m.category", "m.sector_name", "m.payment_method"]),
      type: { column: "m.movement_type", cast: "miclub.movement_type" },
      sectorId: { column: "m.sector_id", cast: "uuid" },
      activityId: { column: "movement_sequence.activity_id", cast: "uuid" },
      categoryId: { column: "m.category_id", cast: "uuid" },
      paymentMethodId: { column: "m.payment_method_id", cast: "uuid" },
      financialStatus: { column: "m.financial_status", cast: "miclub.financial_status" },
      operationalStatus: { column: "m.operational_status", cast: "miclub.movement_status" },
      from: { column: "m.movement_date", operator: ">=", cast: "timestamptz" },
      to: { column: "m.movement_date", operator: "<=", cast: "timestamptz" }
    }
  },
  inscripciones: {
    sectorColumn: "a.sector_id",
    from: `miclub.enrollments e
      join miclub.people p on p.id = e.person_id and p.club_id = e.club_id
      join miclub.activities a on a.id = e.activity_id and a.club_id = e.club_id
      join miclub.sectors s on s.id = a.sector_id and s.club_id = e.club_id
      left join miclub.instructors i on i.id = a.instructor_id and i.club_id = e.club_id`,
    clubColumn: "e.club_id",
    select: `e.id, e.sequence_number, e.external_id, e.person_id, p.first_name, p.last_name, p.dni, p.phone,
      e.activity_id, a.name as activity_name, a.modality, a.sector_id, s.code as sector_code,
      s.name as sector_name, i.display_name as instructor_name, e.fee_amount,
      e.enrollment_price_snapshot, e.fee_price_snapshot, e.fee_frequency_snapshot, e.activity_price_term_id, e.status,
      e.due_date, e.enrollment_date, e.source, e.notes, e.created_at, e.updated_at`,
    orderBy: "coalesce(e.enrollment_date, e.created_at::date) desc nulls last, e.id desc",
    filters: {
      search: textSearch(["p.first_name", "p.last_name", "p.dni", "p.phone", "a.name", "s.name", "i.display_name"]),
      status: { column: "e.status", cast: "miclub.enrollment_status" },
      sectorId: { column: "a.sector_id", cast: "uuid" },
      activityId: { column: "e.activity_id", cast: "uuid" },
      dueFrom: { column: "e.due_date", operator: ">=", cast: "date" },
      dueTo: { column: "e.due_date", operator: "<=", cast: "date" }
    }
  }
} as const satisfies Record<string, ListDefinition>;

export type ReadOnlyResource = keyof typeof listDefinitions;

export const readOnlyResources = Object.keys(listDefinitions) as ReadOnlyResource[];

const legacyActivityDefinition = (): ListDefinition => ({
  ...listDefinitions.actividades,
  from: listDefinitions.actividades.from.replace("left join miclub.employees responsible_employee on responsible_employee.id=a.responsible_employee_id and responsible_employee.club_id=a.club_id", "left join lateral (select e.id,e.person_id from miclub.employees e where e.person_id=i.person_id and e.club_id=a.club_id and e.archived_at is null order by e.created_at,e.id limit 1) responsible_employee on true"),
  select: listDefinitions.actividades.select.replace("a.responsible_employee_id", "responsible_employee.id as responsible_employee_id"),
});

const buildWhere = (definition: ListDefinition, query: PageQuery): { sql: string; params: unknown[] } => {
  const params: unknown[] = [query.clubId];
  const clauses = [`${definition.clubColumn} = $1`];
  if (definition.baseWhere) clauses.push(definition.baseWhere);
  if (query.sectorIds !== undefined && definition.sectorColumn) {
    params.push(query.sectorIds);
    clauses.push(`${definition.sectorColumn} = any($${params.length}::uuid[])`);
  }

  for (const [name, value] of Object.entries(query.filters)) {
    const filter = definition.filters[name];
    if (!filter || value === undefined) continue;
    const operator = filter.operator ?? "=";
    params.push(operator === "ilike" ? `%${value}%` : value);
    const placeholder = filter.cast ? `$${params.length}::${filter.cast}` : `$${params.length}`;
    clauses.push(`${filter.column} ${operator} ${placeholder}`);
  }

  return { sql: `where ${clauses.join(" and ")}`, params };
};

export const getReadOnlyPage = async (resource: ReadOnlyResource, query: PageQuery): Promise<ReadOnlyPage> => {
  const pool = tenantExecutor(query.clubId);
  let definition: ListDefinition = listDefinitions[resource];
  if (resource === "actividades" && !await hasActivityResponsibleEmployee(pool)) definition = legacyActivityDefinition();
  const where = buildWhere(definition, query);
  const limitParam = where.params.length + 1;
  const offsetParam = where.params.length + 2;
  const groupBy = resource === "trabajadores" ? "group by p.id" : "";

  const pageResult = await pool.query<ReadOnlyRow>(
    `select ${definition.select}
     from ${definition.from}
     ${where.sql}
     ${groupBy}
     order by ${definition.orderBy}
     limit $${limitParam}
     offset $${offsetParam}`,
    [...where.params, query.limit, query.offset]
  );
  const countResult = await pool.query<{ total_count: string | number }>(
    `select count(*) as total_count
     from (
       select 1
       from ${definition.from}
       ${where.sql}
       ${groupBy}
     ) counted`,
    where.params
  );

  const totalCount = countResult.rows[0]?.total_count;
  return { rows: pageResult.rows, total: typeof totalCount === "number" ? totalCount : Number(totalCount ?? 0) };
};
