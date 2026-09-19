import type { QueryExecutor } from '../db/postgres.js';
import type { RequestAuthContext } from '../auth/types.js';
import { financialDate, financialError, financialMoney } from './financialCircuitService.js';

type CompensationInput = { hasFixedCompensation: boolean; fixedCompensationAmount: number | null; fixedCompensationFrequency: string | null; currencyCode: string | null; compensationEffectiveFrom?: string | null };
const day = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, count: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return day(date); };
const monthEnd = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return day(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))); };

export async function syncEmployeeCompensationTerm(db: QueryExecutor, auth: Pick<RequestAuthContext, 'clubId' | 'userId'>, employeeId: string, input: CompensationInput) {
  const effectiveFrom = input.compensationEffectiveFrom || (await db.query<{today:string}>(`select (now() at time zone coalesce(timezone,'America/Argentina/Buenos_Aires'))::date::text today from miclub.clubs where id=$1`,[auth.clubId])).rows[0]?.today;
  if(!effectiveFrom) throw financialError('Club inexistente.',404);
  financialDate(effectiveFrom);
  const current = (await db.query<{ id: string; amount: number; currency_code: string; frequency: string; effective_from: string }>(`select id,amount::float8 amount,currency_code,frequency,effective_from::text from miclub.employee_compensation_terms where club_id=$1 and employee_id=$2 and effective_to is null for update`, [auth.clubId, employeeId])).rows[0];
  const unchanged = current && input.hasFixedCompensation && current.amount === input.fixedCompensationAmount && current.currency_code === input.currencyCode && current.frequency === input.fixedCompensationFrequency;
  if (unchanged || (!current && !input.hasFixedCompensation)) return;
  if (current) {
    if (effectiveFrom <= current.effective_from) throw financialError('La nueva vigencia de remuneración debe ser posterior a la vigente.', 400);
    await db.query(`update miclub.employee_compensation_terms set effective_to=$3::date-1,updated_at=now(),revision=revision+1 where club_id=$1 and id=$2`, [auth.clubId, current.id, effectiveFrom]);
  }
  if (input.hasFixedCompensation) await db.query(`insert into miclub.employee_compensation_terms(club_id,employee_id,amount,currency_code,frequency,effective_from,created_by) values($1,$2,$3,$4,$5,$6,$7)`, [auth.clubId, employeeId, input.fixedCompensationAmount, input.currencyCode, input.fixedCompensationFrequency, effectiveFrom, auth.userId]);
}

export function compensationDueDates(from: string, to: string, frequency: string): string[] {
  financialDate(from); financialDate(to);
  if(to<from||!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(frequency)) throw financialError('Vigencia o frecuencia de remuneración inválida.',400);
  const result: string[] = [];
  if (frequency === 'DAILY') for (let value = from; value <= to; value = addDays(value, 1)) result.push(value);
  else if (frequency === 'WEEKLY') for (let value = from; value <= to; value = addDays(value, 7)) result.push(value);
  else if (frequency === 'MONTHLY') {
    for (let cursor = from.slice(0, 7) + '-01'; cursor <= to; ) {
      const due = monthEnd(cursor); if (due >= from && due <= to) result.push(due);
      const date = new Date(`${cursor}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); cursor = day(date);
    }
  } else {
    const anchor = new Date(`${from}T00:00:00Z`);
    for (let year = anchor.getUTCFullYear(); year <= new Date(`${to}T00:00:00Z`).getUTCFullYear(); year += 1) {
      const month=anchor.getUTCMonth();const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
      const due = day(new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(),lastDay)))); if (due >= from && due <= to) result.push(due);
    }
  }
  if (result.length > 20_000) throw financialError('La vigencia genera demasiadas obligaciones; acote el período.');
  return result;
}

export async function refreshEmployeeCompensationObligations(db: QueryExecutor, auth: Pick<RequestAuthContext, 'clubId'>, through?: string) {
  const today = through ? financialDate(through) : (await db.query<{today:string}>(`select (now() at time zone coalesce(timezone,'America/Argentina/Buenos_Aires'))::date::text today from miclub.clubs where id=$1`,[auth.clubId])).rows[0]?.today;
  if(!today) throw financialError('Club inexistente.',404);
  const terms = (await db.query<{ id: string; employee_id: string; person_id: string; sector_id: string | null; amount: number; currency_code: string; frequency: string; effective_from: string; effective_to: string | null }>(`select t.id,t.employee_id,e.person_id,e.sector_id,t.amount::float8 amount,t.currency_code,t.frequency,t.effective_from::text,t.effective_to::text from miclub.employee_compensation_terms t join miclub.employees e on e.id=t.employee_id and e.club_id=t.club_id where t.club_id=$1 and t.effective_from<=$2::date`, [auth.clubId, today])).rows;
  let generated = 0;
  for (const term of terms) {
    const end = term.effective_to && term.effective_to < today ? term.effective_to : today;
    for (const due of compensationDueDates(term.effective_from, end, term.frequency)) {
      const calendarMonthStart = `${due.slice(0, 7)}-01`;
      const periodFrom = term.frequency === 'MONTHLY' ? (calendarMonthStart > term.effective_from ? calendarMonthStart : term.effective_from) : due;
      const result = await db.query(`insert into miclub.employee_compensation_obligations(club_id,term_id,employee_id,person_id,sector_id,period_from,period_to,due_date,amount,currency_code,snapshot) values($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10) on conflict(term_id,period_from,period_to) do nothing returning id`, [auth.clubId, term.id, term.employee_id, term.person_id, term.sector_id, periodFrom, due, term.amount, term.currency_code, JSON.stringify({ amount: term.amount, currencyCode: term.currency_code, frequency: term.frequency })]);
      generated += result.rows.length;
    }
  }
  return { generated, through: today };
}

export async function listEmployeeCompensationObligations(db: QueryExecutor, auth: Pick<RequestAuthContext, 'clubId'>) {
  return (await db.query(`select o.id,o.employee_id "employeeId",o.person_id "personId",concat_ws(' ',p.first_name,p.last_name) "personName",o.currency_code "currencyCode",o.period_from::text "periodFrom",o.period_to::text "periodTo",o.due_date::text "dueDate",o.amount::float8 amount,
    (coalesce((select sum(a.amount) from miclub.employee_compensation_allocations a where a.club_id=o.club_id and a.obligation_id=o.id and a.status='COMPLETADO' and a.voided_at is null),0)+coalesce((select sum(c.amount) from miclub.settlement_compensations c where c.club_id=o.club_id and c.credit_employee_compensation_obligation_id=o.id and c.status='ACTIVE'),0))::float8 paid,
    (o.amount-coalesce((select sum(a.amount) from miclub.employee_compensation_allocations a where a.club_id=o.club_id and a.obligation_id=o.id and a.status='COMPLETADO' and a.voided_at is null),0)-coalesce((select sum(c.amount) from miclub.settlement_compensations c where c.club_id=o.club_id and c.credit_employee_compensation_obligation_id=o.id and c.status='ACTIVE'),0))::float8 balance,
    o.review_state "reviewState",o.revision,o.sector_id "sectorId" from miclub.employee_compensation_obligations o join miclub.people p on p.id=o.person_id and p.club_id=o.club_id where o.club_id=$1 order by o.due_date,o.id`, [auth.clubId])).rows;
}

export async function editEmployeeCompensationObligation(db: QueryExecutor, auth: Pick<RequestAuthContext, 'clubId'>, id: string, revision: number, input: { amount: number; periodFrom: string; periodTo: string; dueDate: string; sectorId: string | null }, _reason: string) {
  financialMoney(input.amount); financialDate(input.periodFrom); financialDate(input.periodTo); financialDate(input.dueDate);
  if (input.periodTo < input.periodFrom) throw financialError('El período es inválido.', 400);
  const before = (await db.query<Record<string, unknown>>(`select * from miclub.employee_compensation_obligations where club_id=$1 and id=$2 for update`, [auth.clubId, id])).rows[0];
  if (!before) throw financialError('Obligación inexistente.', 404);
  if (Number(before.revision) !== revision || before.review_state === 'CANCELLED') throw financialError('La obligación cambió; recargue los datos.');
  if ((await db.query(`select 1 from miclub.employee_compensation_allocations where club_id=$1 and obligation_id=$2 and status='COMPLETADO' and voided_at is null`, [auth.clubId, id])).rows[0]) throw financialError('Una obligación con pagos se corrige anulando primero su grupo.');
  const after = (await db.query<Record<string, unknown>>(`update miclub.employee_compensation_obligations set amount=$3,period_from=$4,period_to=$5,due_date=$6,sector_id=$7,review_state='REQUIRES_REVIEW',revision=revision+1,updated_at=now() where club_id=$1 and id=$2 returning *`, [auth.clubId, id, input.amount, input.periodFrom, input.periodTo, input.dueDate, input.sectorId])).rows[0];
  return after;
}

export async function reviewEmployeeCompensationObligation(db: QueryExecutor, auth: Pick<RequestAuthContext, 'clubId' | 'userId'>, id: string, revision: number, approve: boolean, _reason: string) {
  const state = approve ? 'APPROVED' : 'CANCELLED';
  const row = (await db.query(`update miclub.employee_compensation_obligations set review_state=$4,reviewed_by=$5,reviewed_at=now(),revision=revision+1,updated_at=now() where club_id=$1 and id=$2 and revision=$3 and review_state<>'CANCELLED' returning *`, [auth.clubId, id, revision, state, auth.userId])).rows[0];
  if (!row) throw financialError('La obligación cambió; recargue los datos.');
  return row;
}
