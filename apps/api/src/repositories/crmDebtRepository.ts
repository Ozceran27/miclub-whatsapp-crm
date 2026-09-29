import type { CrmDebt, CrmDebtPage, CrmDebtSummary, CrmMoney } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";

export type CrmDebtFilter = {
  kind: "overdue" | "review" | "all";
  page: number;
  pageSize: number;
  query?: string;
  sectorId?: string;
  activityId?: string;
};

// All CRM reads use the same source: generated enrollment fees and their
// allocations. The operational lifecycle only identifies rows needing review.
const debtCte = `with tenant_day as (
  select (now() at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date today
  from miclub.clubs c where c.id=$1
), fee_rows as (
  select r.enrollment_id,r.currency_code,r.due_date,
    greatest(0,r.amount-r.cancelled_amount-coalesce(sum(pa.amount),0)) balance
  from miclub.receivables r
  left join miclub.payment_allocations pa on pa.club_id=r.club_id and pa.receivable_id=r.id
  where r.club_id=$1 and r.enrollment_id is not null
    and (r.charge_kind='FEE' or r.source_key like 'monthly:%' or (r.charge_kind is null and r.period_month is not null and r.period_year is not null))
  group by r.id
), overdue as (
  select f.enrollment_id,f.currency_code,sum(f.balance) amount,
    count(*)::int installments,min(f.due_date)::text first_due,max(f.due_date)::text last_due
  from fee_rows f cross join tenant_day d
  where f.due_date<d.today and f.balance>0
  group by f.enrollment_id,f.currency_code
), debt as (
  select e.id "enrollmentId",e.person_id "personId",p.first_name "firstName",p.last_name "lastName",
    coalesce(p.phone,'') phone,coalesce(e.enrollment_date,e.created_at::date)::text "enrollmentDate",
    (select max(pay.paid_at)::text from miclub.receivables r
      join miclub.payment_allocations pa on pa.receivable_id=r.id and pa.club_id=r.club_id
      join miclub.payments pay on pay.id=pa.payment_id and pay.club_id=pa.club_id
      where r.club_id=e.club_id and r.enrollment_id=e.id and (r.charge_kind='FEE' or r.source_key like 'monthly:%' or (r.charge_kind is null and r.period_month is not null and r.period_year is not null))) "lastPaymentAt",
    (select max(coalesce(h.sent_at,h.created_at))::text from miclub.crm_message_history h
      where h.club_id=e.club_id and h.status='sent_manual' and (h.enrollment_id=e.id or (h.enrollment_id is null and h.member_id=e.id::text))) "lastContactAt",
    a.id "activityId",a.name "activityName",coalesce(e.modality,a.modality,'') modality,
    coalesce(i.display_name,'') instructor,s.id "sectorId",s.name "sectorName",
    life.effective_status::text status,
    coalesce((select sum(o.installments)::int from overdue o where o.enrollment_id=e.id),0) "overdueCount",
    (select min(o.first_due) from overdue o where o.enrollment_id=e.id) "firstDueDate",
    (select max(o.last_due) from overdue o where o.enrollment_id=e.id) "lastDueDate",
    coalesce((select jsonb_agg(jsonb_build_object('currencyCode',o.currency_code,'amount',o.amount::float8) order by o.currency_code)
      from overdue o where o.enrollment_id=e.id),'[]'::jsonb) balances,
    (select count(*) from fee_rows f where f.enrollment_id=e.id)::int "generatedCount",
    (select count(*) from fee_rows f where f.enrollment_id=e.id and f.due_date is null and f.balance>0)::int "undatedCount"
  from miclub.enrollments e
  join miclub.people p on p.id=e.person_id and p.club_id=e.club_id
  join miclub.activities a on a.id=e.activity_id and a.club_id=e.club_id
  left join miclub.instructors i on i.id=a.instructor_id and i.club_id=a.club_id
  join miclub.sectors s on s.id=a.sector_id and s.club_id=e.club_id
  join miclub.v_enrollment_lifecycle_v2 life on life.enrollment_id=e.id and life.club_id=e.club_id
  where e.club_id=$1 and not coalesce(e.inactive,false) and e.superseded_at is null
    and life.effective_status::text not in ('abandonado','cancelado')
    and ($2::uuid[] is null or s.id=any($2))
), classified as (
  select *,case when "overdueCount">0 then 'overdue'
    when status='adeudando' and ("generatedCount"=0 or "undatedCount">0) then 'review'
    else null end kind from debt
)`;

type DbRow = Omit<CrmDebt,"kind" | "balances"> & {
  kind: "overdue" | "review";
  balances: CrmMoney[] | string;
  generatedCount: number;
  undatedCount: number;
};
const map = (row: DbRow): CrmDebt => ({
  enrollmentId: row.enrollmentId, personId: row.personId, firstName: row.firstName,
  lastName: row.lastName, phone: row.phone, enrollmentDate: row.enrollmentDate,
  lastPaymentAt:row.lastPaymentAt,lastContactAt:row.lastContactAt,
  activityId: row.activityId, activityName: row.activityName, sectorId: row.sectorId,
  modality:row.modality,instructor:row.instructor,
  sectorName: row.sectorName, status: row.status, overdueCount: Number(row.overdueCount),
  firstDueDate: row.firstDueDate, lastDueDate: row.lastDueDate,
  balances: typeof row.balances === "string" ? JSON.parse(row.balances) as CrmMoney[] : row.balances,
  kind: row.kind,
});

const visible = `kind is not null and ($3::text='all' or kind=$3)
  and ($4::text is null or ("firstName"||' '||"lastName") ilike '%'||$4||'%')
  and ($5::uuid is null or "sectorId"=$5)
  and ($6::uuid is null or "activityId"=$6)`;

export const listCrmDebts = async (
  db: QueryExecutor, clubId: string, sectorIds: readonly string[] | null, filter: CrmDebtFilter,
): Promise<CrmDebtPage> => {
  const params = [clubId,sectorIds,filter.kind,filter.query?.trim() || null,filter.sectorId ?? null,filter.activityId ?? null];
  const count = await db.query<{ total: number }>(`${debtCte} select count(*)::int total from classified where ${visible}`, params);
  const rows = await db.query<DbRow>(`${debtCte} select * from classified where ${visible}
    order by case when kind='overdue' then 0 else 1 end,"firstDueDate" asc nulls last,"lastName","firstName","enrollmentId"
    limit $7 offset $8`, [...params,filter.pageSize,(filter.page-1)*filter.pageSize]);
  return {items:rows.rows.map(map),page:filter.page,pageSize:filter.pageSize,total:count.rows[0]?.total ?? 0};
};

export const getCrmDebtSummary = async (db: QueryExecutor, clubId: string, sectorIds: readonly string[] | null): Promise<CrmDebtSummary> => {
  const rows=await db.query<{totalEnrollments:number;overdueEnrollments:number;reviewEnrollments:number;overdueInstallments:number;balances:CrmMoney[] | string}>(`${debtCte}
    select (select count(*)::int from debt) "totalEnrollments",
      count(*) filter(where kind='overdue')::int "overdueEnrollments",
      count(*) filter(where kind='review')::int "reviewEnrollments",
      coalesce(sum("overdueCount") filter(where kind='overdue'),0)::int "overdueInstallments",
      coalesce((select jsonb_agg(jsonb_build_object('currencyCode',currency_code,'amount',amount::float8) order by currency_code)
        from (select item->>'currencyCode' currency_code,sum((item->>'amount')::numeric) amount
          from classified c cross join lateral jsonb_array_elements(c.balances) item
          where c.kind='overdue' group by item->>'currencyCode') totals),'[]'::jsonb) balances
    from classified`,[clubId,sectorIds]);
  const row=rows.rows[0];
  return {totalEnrollments:row?.totalEnrollments ?? 0,overdueEnrollments:row?.overdueEnrollments ?? 0,
    reviewEnrollments:row?.reviewEnrollments ?? 0,overdueInstallments:row?.overdueInstallments ?? 0,
    balances:typeof row?.balances==="string"?JSON.parse(row.balances) as CrmMoney[]:row?.balances ?? []};
};

export const getCrmDebtsByIds = async (db: QueryExecutor, clubId: string, sectorIds: readonly string[] | null, ids: string[]): Promise<CrmDebt[]> => {
  const rows=await db.query<DbRow>(`${debtCte} select * from classified where kind='overdue' and "enrollmentId"=any($3::uuid[])`,[clubId,sectorIds,ids]);
  return rows.rows.map(map);
};
