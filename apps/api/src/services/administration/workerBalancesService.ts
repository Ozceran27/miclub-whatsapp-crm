import { PERMISSIONS, type AdministrationWorkerBalancesResponse, type FinancialCircuit } from '@miclub/shared';
import type { RequestAuthContext } from '../../auth/types.js';
import { withTenantTransaction } from '../../db/transaction.js';
import { getWorkersPage } from '../../repositories/administration/workersRepository.js';
import { compensationDueDates } from '../employeeCompensationService.js';
import { readFinancialCircuit } from '../financialCircuitService.js';

type Worker = { id: string; person_id: string };
type InitialEmployeeBalance = { workerId: string; personId: string; currencyCode: string; balance: number };
type CompensationTerm = { id: string; workerId: string; personId: string; currencyCode: string; amount: number; frequency: string; effectiveFrom: string; effectiveTo: string | null };

export function aggregateWorkerBalances(workers: Worker[], circuit: FinancialCircuit, initialEmployeeBalances: InitialEmployeeBalance[], allSectors: boolean, unmaterialized: InitialEmployeeBalance[] = []): AdministrationWorkerBalancesResponse {
  const byPerson = new Map(workers.map(worker => [worker.person_id, worker.id]));
  const balances = new Map<string, Map<string, { cents: number; pendingReview: boolean }>>();
  const incomplete = new Set<string>();
  for (const diagnostic of circuit.diagnostics) {
    for (const term of circuit.terms) if (term.activityId === diagnostic.activityId && term.personId) incomplete.add(term.personId);
  }
  const add = (personId: string, currencyCode: string, amount: number, pendingReview: boolean) => {
    if (!byPerson.has(personId)) return;
    if (!Number.isFinite(amount)) { incomplete.add(personId); return; }
    const amounts = balances.get(personId) ?? new Map<string, { cents: number; pendingReview: boolean }>();
    const current = amounts.get(currencyCode) ?? { cents: 0, pendingReview: false };
    amounts.set(currencyCode, { cents: current.cents + Math.round(amount * 100), pendingReview: current.pendingReview || pendingReview });
    balances.set(personId, amounts);
  };
  for (const settlement of circuit.settlements) add(settlement.personId, settlement.currencyCode, settlement.balance, settlement.reviewState !== 'APPROVED');
  for (const obligation of circuit.compensationObligations ?? []) {
    if (obligation.reviewState !== 'CANCELLED' && obligation.dueDate <= circuit.today) add(obligation.personId, obligation.currencyCode, obligation.balance, obligation.reviewState !== 'APPROVED');
  }
  for (const opening of initialEmployeeBalances) add(opening.personId, opening.currencyCode, opening.balance, false);
  for (const due of unmaterialized) add(due.personId, due.currencyCode, due.balance, true);
  return {
    asOf: circuit.today,
    scope: allSectors ? 'ALL_SECTORS' : 'VISIBLE_SECTORS',
    items: workers.map(worker => ({
      workerId: worker.id,
      personId: worker.person_id,
      status: incomplete.has(worker.person_id) ? 'INCOMPLETE' : 'AVAILABLE',
      amounts: [...(balances.get(worker.person_id) ?? new Map<string, { cents: number; pendingReview: boolean }>())].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, entry]) => ({ currencyCode, amount: entry.cents / 100, pendingReview: entry.pendingReview })),
    })),
  };
}

export async function getAdministrationWorkerBalances(auth: RequestAuthContext, limit: number, offset: number): Promise<AdministrationWorkerBalancesResponse> {
  const workers = (await getWorkersPage(auth.clubId, limit, offset)).rows.map(row => ({ id: row.id, person_id: row.person_id }));
  const allSectors = auth.permissions.includes(PERMISSIONS.SECTORS_ANY);
  if (!workers.length) return { asOf: new Date().toISOString().slice(0, 10), scope: allSectors ? 'ALL_SECTORS' : 'VISIBLE_SECTORS', items: [] };
  const circuit = await readFinancialCircuit(auth);
  const accrued = await withTenantTransaction(auth.clubId, async db => {
    const initial = (await db.query<InitialEmployeeBalance>(`select e.id::text "workerId",e.person_id::text "personId",o.currency_code "currencyCode",(o.amount-o.settled_amount)::float8 balance
    from miclub.initial_obligations o join miclub.employees e on e.person_id=o.person_id and e.club_id=o.club_id
    left join miclub.activities a on a.id=o.activity_id and a.club_id=o.club_id
    where o.club_id=$1 and e.id=any($2::uuid[]) and o.kind='EMPLOYEE' and o.review_state='APPROVED' and o.due_date<=$3::date
      and exists(select 1 from miclub.finance_startups f where f.club_id=o.club_id and f.approved_snapshot is not null)
      and ($4::uuid[] is null or a.sector_id=any($4))`, [auth.clubId, workers.map(worker => worker.id), circuit.today, allSectors ? null : auth.sectorIds])).rows;
    const terms = (await db.query<CompensationTerm>(`select t.id::text,e.id::text "workerId",e.person_id::text "personId",t.currency_code "currencyCode",t.amount::float8 amount,t.frequency,t.effective_from::text "effectiveFrom",t.effective_to::text "effectiveTo"
      from miclub.employee_compensation_terms t join miclub.employees e on e.id=t.employee_id and e.club_id=t.club_id
      where t.club_id=$1 and e.id=any($2::uuid[]) and t.effective_from<=$3::date and ($4::uuid[] is null or e.sector_id=any($4))`, [auth.clubId, workers.map(worker => worker.id), circuit.today, allSectors ? null : auth.sectorIds])).rows;
    const materialized = (await db.query<{ termId: string; dueDate: string }>(`select o.term_id::text "termId",o.due_date::text "dueDate" from miclub.employee_compensation_obligations o where o.club_id=$1 and o.employee_id=any($2::uuid[]) and o.due_date<=$3::date`, [auth.clubId, workers.map(worker => worker.id), circuit.today])).rows;
    const cutoff = (await db.query<{ cutoffDate: string }>(`select cutoff_date::text "cutoffDate" from miclub.finance_startups where club_id=$1 and approved_snapshot is not null`, [auth.clubId])).rows[0]?.cutoffDate;
    return { initial, terms, materialized, cutoff };
  });
  const existingDueDates = new Set(accrued.materialized.map(row => `${row.termId}:${row.dueDate}`));
  const unmaterialized: InitialEmployeeBalance[] = [];
  for (const term of accrued.terms) {
    const end = term.effectiveTo && term.effectiveTo < circuit.today ? term.effectiveTo : circuit.today;
    for (const due of compensationDueDates(term.effectiveFrom, end, term.frequency)) {
      if (due <= (accrued.cutoff ?? '') || existingDueDates.has(`${term.id}:${due}`)) continue;
      unmaterialized.push({ workerId: term.workerId, personId: term.personId, currencyCode: term.currencyCode, balance: term.amount });
    }
  }
  return aggregateWorkerBalances(workers, circuit, accrued.initial, allSectors, unmaterialized);
}
