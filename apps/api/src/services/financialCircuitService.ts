import { createHash, randomUUID } from 'node:crypto';
import { PERMISSIONS, type FinancialCircuit, type PersistedSettlement, type PartialMonthPolicy } from '@miclub/shared';
import { withTenantTransaction } from '../db/transaction.js';
import type { QueryExecutor } from '../db/postgres.js';
import type { RequestAuthContext } from '../auth/types.js';
import { calculateMonthlySettlements, proposeResponsibleCompensations, type MonthlyActivityTerm, type MonthlyCollection, type MonthlyRefund, type MonthlyResponsiblePayment } from './activitySettlementService.js';
import { calculateFinancialProjection } from './operationalBalancesCalculator.js';
import { createExchangeRateService, ExchangeRateError } from './exchangeRateService.js';
import { convertMoney, type CurrencyCode, type AppliedExchangeRate } from './moneyConversion.js';

export const financialError = (message: string, status = 409) => Object.assign(new Error(message), { status, code: 'FINANCIAL_REVIEW_REQUIRED' });
export async function assertFinancialSchema(db: QueryExecutor): Promise<void> {
  const result = await db.query<{ ready: boolean }>(`select
    to_regprocedure('miclub.finance_lock(uuid)') is not null
    and to_regclass('miclub.refund_obligation_applications') is not null
    and exists(select 1 from pg_attribute where attrelid=to_regclass('miclub.initial_obligations') and attname='review_state' and not attisdropped)
    and exists(select 1 from pg_attribute where attrelid=to_regclass('miclub.movements') and attname='initial_obligation_id' and not attisdropped) as ready`);
  if (result.rows[0]?.ready === false) throw Object.assign(new Error('La base de datos requiere la actualización del circuito financiero. Ejecute el script completo docs/dbeaver/2026-09-09-circuito-financiero.sql en DBeaver y vuelva a intentar.'), { status: 503, expose: true, code: 'FINANCIAL_SCHEMA_REQUIRED', retryable: false });
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const financialMoney = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999999999.99 || Math.abs(Math.round(value * 100) - value * 100) > .0001) throw financialError('Importe inválido; use hasta dos decimales.', 400);
  return value;
};
export const financialDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw financialError('Fecha inválida.', 400);
  return value;
};
export async function financeTransaction<T>(auth: RequestAuthContext, key: string, request: unknown, reason: string, action: (db: QueryExecutor) => Promise<T>): Promise<T> {
  if (!key || key.length > 200 || !reason.trim()) throw financialError('Se requieren clave de operación y motivo.', 400);
  return withTenantTransaction(auth.clubId, async db => {
    await assertFinancialSchema(db);
    await db.query('select miclub.finance_lock($1)', [auth.clubId]);
    await db.query("select set_config('app.finance_actor',$1,true),set_config('app.finance_reason',$2,true)", [auth.userId, reason]);
    const previous = (await db.query<{ request_hash: string; response: T }>('select request_hash,response from miclub.finance_operations where club_id=$1 and operation_key=$2', [auth.clubId, key])).rows[0];
    const fingerprint = hash(request);
    if (previous) {
      if (previous.request_hash !== fingerprint) throw financialError('La clave de operación ya se usó con otros datos.');
      return previous.response;
    }
    const result = await action(db);
    await db.query('insert into miclub.finance_operations(club_id,operation_key,request_hash,response) values($1,$2,$3,$4)', [auth.clubId, key, fingerprint, JSON.stringify(result)]);
    return result;
  });
}

type Term = MonthlyActivityTerm & { activityName: string; personName: string; revision: number };
export type FinanceScope = Pick<RequestAuthContext, 'clubId' | 'permissions' | 'sectorIds'>;
type RawSettlement = { id: string; revision: number; review_state: PersistedSettlement['reviewState']; closed_at: Date | null; calculation_hash: string };
export async function loadCircuit(db: QueryExecutor, auth: FinanceScope, selectedMonth?: string): Promise<FinancialCircuit> {
  await assertFinancialSchema(db);
  await db.query('select miclub.finance_lock($1)', [auth.clubId]);
  const club = (await db.query<{ timezone: string; currency: string; today: string }>("select coalesce(timezone,'America/Argentina/Buenos_Aires') timezone,base_currency_code currency,(now() at time zone coalesce(timezone,'America/Argentina/Buenos_Aires'))::date::text today from miclub.clubs where id=$1", [auth.clubId])).rows[0];
  if (!club) throw financialError('Club no disponible.', 404);
  const month = selectedMonth ?? club.today.slice(0, 7);
  financialDate(`${month}-01`);
  if (month > club.today.slice(0, 7)) throw financialError('No se puede liquidar un mes futuro.', 400);
  const sectors = auth.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : auth.sectorIds;
  const terms = (await db.query<Term>(`select t.id,t.activity_id "activityId",a.sector_id "sectorId",t.mode,
    t.fixed_club_fee::float8 "fixedClubFee",t.fixed_fee_frequency "fixedFeeFrequency",t.club_share_percentage::float8 "clubSharePercentage",
    t.effective_from::text "effectiveFrom",t.effective_to::text "effectiveTo",t.responsible_person_id "personId",
    coalesce(t.currency_code,$2) "currencyCode",t.partial_month_policy "partialMonthPolicy",t.revision,
    a.name "activityName",concat_ws(' ',p.first_name,p.last_name) "personName"
    from miclub.activity_terms t join miclub.activities a on a.id=t.activity_id and a.club_id=t.club_id
    left join miclub.people p on p.id=t.responsible_person_id and p.club_id=t.club_id
    where t.club_id=$1 and ($3::uuid[] is null or a.sector_id=any($3)) order by t.effective_from,t.id`, [auth.clubId, club.currency, sectors])).rows;
  const collections = (await db.query<MonthlyCollection>(`select m.id,m.activity_id "activityId",m.movement_date "occurredAt",m.amount::float8 amount,m.currency_code "currencyCode",m.operational_status status,m.voided_at "voidedAt"
    from miclub.movements m join miclub.movement_categories c on c.id=m.category_id and c.club_id=m.club_id
    join miclub.category_catalog cc on cc.id=c.catalog_id
    where m.club_id=$1 and m.movement_type='INGRESOS' and cc.classification='OPERATIONAL' and m.activity_id is not null
    and not exists(select 1 from miclub.activity_settlement_allocations x where x.club_id=m.club_id and x.movement_id=m.id)
    and ($2::uuid[] is null or m.sector_id=any($2)) order by m.id`, [auth.clubId, sectors])).rows;
  const refunds = (await db.query<MonthlyRefund & { activityId: string }>(`select r.id,r.original_movement_id "collectionId",r.original_term_id "originalTermId",r.responsible_amount::float8 "originalResponsibleAmount",
    m.amount::float8 amount,m.movement_date "occurredAt",m.operational_status status,m.voided_at "voidedAt",o.activity_id "activityId"
    from miclub.movement_refunds r join miclub.movements m on m.id=r.refund_movement_id and m.club_id=r.club_id
    join miclub.movements o on o.id=r.original_movement_id and o.club_id=r.club_id where r.club_id=$1 and r.original_term_id is not null
    order by m.movement_date,r.id`, [auth.clubId])).rows;
  const payments = (await db.query<MonthlyResponsiblePayment & { activityId: string; occurredAt: Date }>(`select x.id,s.activity_term_id "termId",to_char(s.period_from,'YYYY-MM') as "month",x.amount::float8 amount,m.movement_date "occurredAt",
    case when m.movement_type='INGRESOS' then 'DEBT_COLLECTION' else 'PAYMENT' end kind,
    case when m.operational_status='COMPLETADO' and x.status='COMPLETADO' then 'COMPLETADO' else 'PENDIENTE' end status,
    coalesce(m.voided_at,x.voided_at) "voidedAt",s.activity_id "activityId"
    from miclub.activity_settlement_allocations x join miclub.activity_settlements s on s.id=x.settlement_id and s.club_id=x.club_id
    join miclub.movements m on m.id=x.movement_id and m.club_id=x.club_id where x.club_id=$1 order by x.id`, [auth.clubId])).rows;
  const startup = (await db.query<{ mode: string; cutoff_date: string; status: string }>('select mode,cutoff_date::text,status from miclub.finance_startups where club_id=$1 and approved_snapshot is not null', [auth.clubId])).rows[0];
  const distributions = (await db.query<{ termId: string; month: string; amount: number }>("select activity_term_id \"termId\",to_char(month,'YYYY-MM') as \"month\",amount::float8 amount from miclub.fixed_fee_distributions where club_id=$1", [auth.clubId])).rows;
  const diagnostics: FinancialCircuit['diagnostics'] = [];
  const settlements: PersistedSettlement[] = [];
  for (const activityId of new Set(terms.map(t => t.activityId))) {
    const activityTerms = terms.filter(t => t.activityId === activityId);
    const activityCollections = collections.filter(c => c.activityId === activityId);
    const activityRefunds = refunds.filter(r => r.activityId === activityId);
    const activityPayments = payments.filter(p => p.activityId === activityId);
    let first = activityTerms[0].effectiveFrom.slice(0, 7);
    if (startup && first < startup.cutoff_date.slice(0, 7)) first = startup.cutoff_date.slice(0, 7);
    for (let current = first, count = 0; current <= club.today.slice(0, 7); count++) {
      if (count > 600) throw financialError('El intervalo supera 50 años; revise las vigencias.');
      const end = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5)), 0)).toISOString().slice(0, 10);
      try {
        const lines = calculateMonthlySettlements({ month: current, timeZone: club.timezone, terms: activityTerms,
          collections: activityCollections,
          refunds: activityRefunds.filter(r => !startup || localDay(r.occurredAt, club.timezone) > startup.cutoff_date), payments: activityPayments.filter(p => !startup || localDay(p.occurredAt, club.timezone) > startup.cutoff_date),
          fullMonthFeeAllocations: distributions.filter(d => d.month === current) });
        for (const line of lines) {
          const term = activityTerms.find(t => t.id === line.termId)!;
          if (startup && current === startup.cutoff_date.slice(0, 7)) {
            const excluded = activityCollections.filter(c => c.status === 'COMPLETADO' && !c.voidedAt && localDay(c.occurredAt, club.timezone).slice(0, 7) === current && localDay(c.occurredAt, club.timezone) <= startup.cutoff_date && localDay(c.occurredAt, club.timezone) >= term.effectiveFrom && (!term.effectiveTo || localDay(c.occurredAt, club.timezone) <= term.effectiveTo));
            const excludedIncome = excluded.reduce((sum, c) => sum + c.amount, 0);
            const excludedResponsible = excluded.reduce((sum, c) => sum + (term.mode === 'FIXED' ? c.amount : Math.round(c.amount * (100 - term.clubSharePercentage!)) / 100), 0);
            line.income -= excludedIncome; line.responsibleIncome -= excludedResponsible; line.balance -= excludedResponsible;
            // Opening obligations include the fee already incurred at the cutoff.
            if (term.partialMonthPolicy === 'FULL_MONTH') { line.balance += line.fixedClubFee; line.fixedClubFee = 0; }
            else if (term.mode === 'FIXED') {
              const days = Number(end.slice(-2));
              const priorDays = Math.max(0, Number(startup.cutoff_date.slice(-2)) - Number((term.effectiveFrom > `${current}-01` ? term.effectiveFrom : `${current}-01`).slice(-2)) + 1);
              const priorFee = Math.min(line.fixedClubFee, Math.round(term.fixedClubFee! * priorDays / days * 100) / 100);
              line.fixedClubFee -= priorFee; line.balance += priorFee;
            }
          }
          const fingerprint = hash({ income: line.income, responsibleIncome: line.responsibleIncome, refunds: line.refunds, responsibleRefunds: line.responsibleRefunds, fixedClubFee: line.fixedClubFee, personId: line.personId });
          const stored = (await db.query<RawSettlement>(`insert into miclub.activity_settlements(club_id,activity_id,activity_term_id,period_from,period_to,circuit_version,calculation,calculation_hash)
            values($1,$2,$3,$4,$5,1,$6,$7) on conflict(activity_term_id,period_from,period_to) do update
            set calculation=excluded.calculation,calculated_at=now(),circuit_version=1,
            review_state=case when miclub.activity_settlements.calculation_hash is distinct from excluded.calculation_hash and miclub.activity_settlements.review_state<>'DRAFT' then 'REQUIRES_REVIEW' else miclub.activity_settlements.review_state end,
            revision=miclub.activity_settlements.revision+case when miclub.activity_settlements.calculation_hash is distinct from excluded.calculation_hash then 1 else 0 end,
            calculation_hash=excluded.calculation_hash returning id,revision,review_state,closed_at,calculation_hash`,
          [auth.clubId, activityId, line.termId, `${current}-01`, end, JSON.stringify(line), fingerprint])).rows[0];
          settlements.push({ ...line, id: stored.id, revision: stored.revision, reviewState: stored.review_state, closedAt: stored.closed_at?.toISOString() ?? null, activityName: term.activityName, personName: term.personName });
        }
      } catch (error) {
        if (!(error instanceof Error) || 'code' in error) throw error;
        diagnostics.push({ activityId, message: `${activityTerms[0].activityName} ${current}: ${error.message}` });
      }
      const date = new Date(`${current}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); current = date.toISOString().slice(0, 7);
    }
  }
  if (startup) {
    const initial = (await db.query<{ id: string; personId: string; activityId: string | null; currencyCode: string; amount: number; settled: number; month: string; personName: string; activityName: string }>(`select o.id,o.person_id "personId",o.activity_id "activityId",o.currency_code "currencyCode",o.amount::float8 amount,o.settled_amount::float8 settled,to_char(o.due_date,'YYYY-MM') "month",concat_ws(' ',p.first_name,p.last_name) "personName",coalesce(a.name,'Saldo inicial general') "activityName"
      from miclub.initial_obligations o join miclub.people p on p.id=o.person_id and p.club_id=o.club_id left join miclub.activities a on a.id=o.activity_id and a.club_id=o.club_id
      where o.club_id=$1 and o.kind='RESPONSIBLE' and o.review_state='APPROVED' and ($2::uuid[] is null or a.sector_id=any($2))`, [auth.clubId, sectors])).rows;
    for (const o of initial) settlements.push({ id: o.id, initialObligationId: o.id, termId: '', personId: o.personId, activityId: o.activityId ?? '', currencyCode: o.currencyCode, month: o.month, income: 0, responsibleIncome: 0, refunds: 0, responsibleRefunds: 0, fixedClubFee: 0, payments: Math.max(0, o.settled), debtCollections: Math.max(0, -o.settled), balance: o.amount - o.settled, paymentState: 'PENDING', revision: 1, reviewState: 'APPROVED', closedAt: null, personName: o.personName, activityName: `Saldo inicial · ${o.activityName}` });
  }
  const comps = (await db.query<{ debt_settlement_id: string; credit_settlement_id: string; amount: number }>('select coalesce(debt_settlement_id,debt_initial_obligation_id) debt_settlement_id,coalesce(credit_settlement_id,credit_initial_obligation_id) credit_settlement_id,amount::float8 amount from miclub.settlement_compensations where club_id=$1', [auth.clubId])).rows;
  for (const row of settlements) {
    row.balance = Math.round((row.balance + comps.filter(c => c.debt_settlement_id === row.id).reduce((s, c) => s + c.amount, 0) - comps.filter(c => c.credit_settlement_id === row.id).reduce((s, c) => s + c.amount, 0)) * 100) / 100;
    row.paymentState = row.balance < 0 ? 'DEBT' : row.balance === 0 ? 'SETTLED' : row.payments > 0 ? 'PARTIAL' : 'PENDING';
  }
  const projection = await circuitProjection(db, auth, club, terms, settlements, diagnostics.length > 0);
  const accounts = (await db.query<FinancialCircuit['accounts'][number]>('select id,name,currency_code "currencyCode" from miclub.financial_accounts where club_id=$1 and status=\'ACTIVE\' order by name', [auth.clubId])).rows;
  const people = (await db.query<FinancialCircuit['people'][number]>("select id,concat_ws(' ',first_name,last_name) name from miclub.people where club_id=$1 order by first_name,last_name", [auth.clubId])).rows;
  return { month, today: club.today, settlements: settlements.filter(s => s.month <= month), diagnostics, projection, accounts, people,
    terms: terms.map(t => ({ id: t.id, activityId: t.activityId, activityName: t.activityName, personId: t.personId ?? null, revision: t.revision, mode: t.mode, effectiveFrom: t.effectiveFrom, effectiveTo: t.effectiveTo ?? null, fixedClubFee: t.fixedClubFee ?? null, partialMonthPolicy: t.partialMonthPolicy ?? null })) };
}

export const localDay = (value: string | Date, timezone: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

async function circuitProjection(db: QueryExecutor, auth: FinanceScope, club: { currency: string; today: string }, terms: Term[], settlements: PersistedSettlement[], incomplete: boolean) {
  const sectors = auth.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : auth.sectorIds;
  const valued = (await db.query<{ liquidity: string | null; valuation_status: string }>('select liquidity,valuation_status from miclub.value_club_liquidity($1,$2)', [auth.clubId, club.today])).rows[0];
  const pending = (await db.query<{ id: string; receivable_id: string | null; activity_id: string | null; amount: number; movement_type: string; currency_code: string }>(`select m.id,m.receivable_id,m.activity_id,m.amount::float8 amount,m.movement_type::text,m.currency_code from miclub.movements m join miclub.clubs c on c.id=m.club_id
    where m.club_id=$1 and m.operational_status='PENDIENTE' and m.voided_at is null and ($2::uuid[] is null or m.sector_id=any($2))
    and not exists(select 1 from miclub.finance_startups s where s.club_id=m.club_id and s.approved_snapshot is not null and (m.movement_date at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date<=s.cutoff_date)`, [auth.clubId, sectors])).rows;
  const initialPayables = (await db.query<(typeof pending)[number]>(`select 'opening:'||o.id id,null::uuid receivable_id,o.activity_id,(o.amount-o.settled_amount)::float8 amount,'EGRESOS' movement_type,o.currency_code
    from miclub.initial_obligations o left join miclub.activities a on a.id=o.activity_id and a.club_id=o.club_id where o.club_id=$1 and o.review_state='APPROVED' and o.kind in ('EMPLOYEE','SUPPLIER') and o.amount>o.settled_amount and ($2::uuid[] is null or a.sector_id=any($2)) and exists(select 1 from miclub.finance_startups s where s.club_id=o.club_id and s.approved_snapshot is not null)`, [auth.clubId,sectors])).rows;
  pending.push(...initialPayables);
  const dues = (await db.query<{ id: string; activity_id: string | null; amount: number; currency_code: string; abandoned: boolean }>(`select r.id,r.activity_id,greatest(0,r.amount-r.cancelled_amount-coalesce(p.paid,0))::float8 amount,r.currency_code,
    coalesce(e.inactive or e.status::text in ('abandonado','cancelado'),false) abandoned
    from miclub.receivables r left join miclub.enrollments e on e.id=r.enrollment_id and e.club_id=r.club_id
    left join lateral(select sum(a.amount) paid from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id) p on true
    where r.club_id=$1 and r.status<>'cancelado' and ($2::uuid[] is null or r.sector_id=any($2))
    and (r.source_key like 'opening:%' or not exists(select 1 from miclub.finance_startups s where s.club_id=r.club_id and s.approved_snapshot is not null and r.due_date<=s.cutoff_date))`, [auth.clubId, sectors])).rows;
  const missing: string[] = incomplete ? ['Acuerdos históricos pendientes de revisión'] : [];
  if (sectors) missing.push('La proyección integral requiere acceso a todos los sectores.');
  const share = (activityId: string | null, amount: number) => {
    if (!activityId) return 0;
    const term = terms.find(t => t.activityId === activityId && t.effectiveFrom <= club.today && (!t.effectiveTo || t.effectiveTo >= club.today));
    if (!term) { missing.push(`Actividad ${activityId} sin acuerdo`); return 0; }
    return term.mode === 'FIXED' ? amount : Math.round(amount * (100 - term.clubSharePercentage!) ) / 100;
  };
  const assumptions = ['Cobros sin fecha comprometida: acuerdo vigente a la fecha del cálculo.'];
  const quotes = new Map<string, AppliedExchangeRate | null>();
  const rates = createExchangeRateService({ source: 'persisted', fetchRate: () => Promise.reject(new Error('La proyección sólo utiliza cotizaciones persistidas.')) }, { maxAgeDays: 4, pivot: 'USD', executor: db });
  for (const currency of new Set([...pending.map(p => p.currency_code), ...dues.map(r => r.currency_code), ...settlements.map(s => s.currencyCode)])) {
    if (currency === club.currency) continue;
    try {
      const quote = await rates.latest(currency as CurrencyCode, club.currency as CurrencyCode, club.today);
      quotes.set(currency, quote);
      assumptions.push(`${currency}/${club.currency}: ${quote.rate}, fecha ${quote.rateDate}, fuente ${quote.source}, referencias ${(quote.components ?? []).map(c => c.id).join(', ')}.`);
    } catch (error) {
      if (!(error instanceof ExchangeRateError)) throw error;
      quotes.set(currency, null); missing.push(error.message);
    }
  }
  const value = (amount: number, currency: string) => currency === club.currency ? amount : quotes.get(currency) ? Number(convertMoney({ amount, fromCurrency: currency as CurrencyCode, toCurrency: club.currency as CurrencyCode, valuationDate: club.today, quote: quotes.get(currency)! })) : 0;
  // Split the remaining receivable from explicitly scheduled collections. Each
  // cash movement keeps its own identity; the residual is a separate component.
  const scheduled = new Map<string, number>();
  for (const p of pending.filter(p => p.movement_type === 'INGRESOS' && p.receivable_id)) {
    const due = dues.find(r => r.id === p.receivable_id);
    if (!due || due.currency_code !== p.currency_code) missing.push(`Cobro ${p.id}: obligación incompatible; requiere conciliación.`);
    scheduled.set(p.receivable_id!, (scheduled.get(p.receivable_id!) ?? 0) + p.amount);
  }
  for (const due of dues) if ((scheduled.get(due.id) ?? 0) > due.amount) missing.push(`Cuota ${due.id}: los cobros previstos superan el saldo pendiente.`);
  const grouped = new Map<string, number>();
  for (const row of settlements) {
    const key = `${row.personId}:${row.currencyCode}`;
    grouped.set(key, (grouped.get(key) ?? 0) + row.balance);
  }
  return calculateFinancialProjection({ calculatedAt: new Date().toISOString(), currencyCode: club.currency,
    liquidity: !sectors && valued?.valuation_status === 'COMPLETE' ? Number(valued.liquidity) : null,
    pendingCollections: pending.filter(p => p.movement_type === 'INGRESOS').map(p => ({ obligationId: `movement:${p.id}`, amount: value(p.amount, p.currency_code), responsibleAmount: value(share(p.activity_id, p.amount), p.currency_code) })),
    pendingPayments: pending.filter(p => p.movement_type === 'EGRESOS').map(p => ({ obligationId: `movement:${p.id}`, amount: value(p.amount, p.currency_code) })),
    pendingSettlements: [...grouped].filter(([, balance]) => balance > 0).map(([key, amount]) => ({ obligationId: `responsible:${key}`, amount: value(Math.round(amount * 100) / 100, key.split(':')[1]) })),
    unpaidReceivables: dues.map(r => { const remainder = Math.max(0, Math.round((r.amount - (scheduled.get(r.id) ?? 0)) * 100) / 100); return { obligationId: `remainder:${r.id}`, amount: value(remainder, r.currency_code), responsibleAmount: value(share(r.activity_id, remainder), r.currency_code), abandoned: r.abandoned }; }),
    missingValuations: missing, assumptions });
}

export async function readFinancialCircuit(auth: FinanceScope, month?: string) {
  return withTenantTransaction(auth.clubId, db => loadCircuit(db, auth, month));
}

export async function reviewSettlement(db: QueryExecutor, auth: RequestAuthContext, id: string, revision: number, reason: string, close: boolean) {
  const circuit = await loadCircuit(db, auth);
  const row = circuit.settlements.find(s => s.id === id);
  if (!row) throw financialError('Liquidación no encontrada.', 404);
  if (row.initialObligationId) throw financialError('El saldo inicial se aprueba mediante la conciliación del arranque.');
  if (row.revision !== revision) throw financialError('El cálculo cambió. Revise la versión vigente.');
  if (close && (row.reviewState !== 'APPROVED' || row.month >= circuit.today.slice(0, 7))) throw financialError('El cierre requiere aprobación y un mes ya terminado.');
  await db.query(`insert into miclub.settlement_reviews(club_id,settlement_id,revision,snapshot,actor_id,reason) values($1,$2,$3,$4,$5,$6)
    on conflict(settlement_id,revision) do nothing`, [auth.clubId, id, revision, JSON.stringify(row), auth.userId, reason]);
  await db.query("update miclub.activity_settlements set review_state='APPROVED',reviewed_by=$3,closed_at=case when $4 then now() else closed_at end where club_id=$1 and id=$2", [auth.clubId, id, auth.userId, close]);
  await db.query('insert into miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason) values($1,\'activity_settlements\',$2,$3,$4,$5,$6)', [auth.clubId, id, JSON.stringify(row), JSON.stringify({ ...row, reviewState: 'APPROVED', operation: close ? 'CLOSE' : 'APPROVE' }), auth.userId, reason]);
  return { id, approved: true, closed: close };
}

export async function resolveTerm(db: QueryExecutor, auth: RequestAuthContext, id: string, revision: number, personId: string, policy: PartialMonthPolicy | null, distributions: { month: string; amount: number }[]) {
  const paid = (await db.query(`select t.id from miclub.activity_terms t where t.club_id=$1 and t.id=$2 and t.responsible_person_id is not null and t.responsible_person_id<>$3
    and exists(select 1 from miclub.activity_settlements s join miclub.activity_settlement_allocations a on a.settlement_id=s.id and a.club_id=s.club_id where s.activity_term_id=t.id and a.status='COMPLETADO' and a.voided_at is null)`, [auth.clubId, id, personId])).rows[0];
  if (paid) throw financialError('El receptor de pagos realizados no puede sustituirse; conserve ese término histórico y registre una nueva vigencia.');
  const allowed = (await db.query<{ id: string }>(`select t.id from miclub.activity_terms t join miclub.activities a on a.id=t.activity_id and a.club_id=t.club_id
    join miclub.people p on p.id=$3 and p.club_id=t.club_id where t.club_id=$1 and t.id=$2 and ($4::uuid[] is null or a.sector_id=any($4))`, [auth.clubId, id, personId, auth.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : auth.sectorIds])).rows[0];
  if (!allowed) throw financialError('Referencia de actividad o responsable no disponible.', 404);
  if (!['CALENDAR_DAYS', 'FULL_MONTH', null].includes(policy)) throw financialError('Política de mes parcial inválida.', 400);
  const result = await db.query('update miclub.activity_terms set responsible_person_id=$3,partial_month_policy=$4 where club_id=$1 and id=$2 and revision=$5 returning id', [auth.clubId, id, personId, policy, revision]);
  if (!result.rows.length) throw financialError('El acuerdo cambió; recargue los datos.');
  for (const d of distributions) {
    financialDate(`${d.month}-01`); financialMoney(d.amount);
    await db.query('insert into miclub.fixed_fee_distributions(club_id,activity_term_id,month,amount) values($1,$2,$3,$4) on conflict(club_id,activity_term_id,month) do update set amount=excluded.amount', [auth.clubId, id, `${d.month}-01`, d.amount]);
  }
  return { id };
}

export async function recordResponsiblePayment(db: QueryExecutor, auth: RequestAuthContext, personId: string, accountId: string, amount: number, date: string, debtCollection: boolean) {
  financialMoney(amount); financialDate(date);
  if (amount <= 0) throw financialError('El importe debe ser mayor a cero.', 400);
  const circuit = await loadCircuit(db, auth);
  const account = circuit.accounts.find(a => a.id === accountId);
  if (!account) throw financialError('Cuenta no disponible.', 404);
  const rows = circuit.settlements.filter(s => s.personId === personId && s.currencyCode === account.currencyCode);
  if (!rows.length || rows.some(r => r.reviewState !== 'APPROVED')) throw financialError('Revise todas las liquidaciones del responsable antes de operar.');
  const net = Math.round(rows.reduce((sum, r) => sum + r.balance, 0) * 100) / 100;
  if (amount > (debtCollection ? -net : net)) throw financialError('El importe supera el saldo neto disponible.');
  const proposal = proposeResponsibleCompensations(rows.map(r => ({ ...r })));
  for (const c of proposal.compensations) {
    const debt = rows.find(r => r.id === c.debtLineId)!;
    const credit = rows.find(r => r.id === c.creditLineId)!;
    await db.query('insert into miclub.settlement_compensations(club_id,person_id,currency_code,debt_settlement_id,credit_settlement_id,amount,debt_initial_obligation_id,credit_initial_obligation_id) values($1,$2,$3,$4,$5,$6,$7,$8)', [auth.clubId, personId, account.currencyCode, debt.initialObligationId ? null : debt.id, credit.initialObligationId ? null : credit.id, c.amount, debt.initialObligationId ?? null, credit.initialObligationId ?? null]);
  }
  const timezone = (await db.query<{ timezone: string }>("select coalesce(timezone,'America/Argentina/Buenos_Aires') timezone from miclub.clubs where id=$1", [auth.clubId])).rows[0].timezone;
  if (date > circuit.today) throw financialError('Un pago realizado no puede tener fecha futura.', 400);
  const group = randomUUID(); let remaining = amount;
  for (const entry of proposal.remaining) {
    if (remaining <= 0) break;
    const available = debtCollection ? -entry.balance : entry.balance;
    if (available <= 0) continue;
    const row = rows.find(r => r.id === entry.id)!;
    const portion = Math.min(remaining, available);
    if (row.initialObligationId) {
      await db.query(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,sector_id,activity_id,concept,person_id,counterparty_text,amount,currency_code,account_id,financial_status,operational_status,source,payout_group_id,initial_obligation_id)
        values($1,miclub.next_tenant_sequence($1,'movement'),'finance:'||gen_random_uuid(),$2::date at time zone $3,$4::miclub.movement_type,(select sector_id from miclub.activities where club_id=$1 and id=$12),$12,'Aplicación de saldo inicial',$6,$7,$8,$9,$10,'pagado','COMPLETADO','finance_circuit',$11,$5)`, [auth.clubId, date, timezone, debtCollection ? 'INGRESOS' : 'EGRESOS', row.initialObligationId, personId, row.personName, portion, account.currencyCode, accountId, group, row.activityId || null]);
      await db.query('update miclub.initial_obligations set settled_amount=settled_amount+$3 where club_id=$1 and id=$2', [auth.clubId, row.initialObligationId, debtCollection ? -portion : portion]);
      remaining = Math.round((remaining - portion) * 100) / 100;
      continue;
    }
    const movement = (await db.query<{ id: string }>(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,sector_id,activity_id,concept,person_id,counterparty_text,amount,currency_code,account_id,financial_status,operational_status,source,payout_group_id)
      select $1,miclub.next_tenant_sequence($1,'movement'),'finance:'||gen_random_uuid(),$2::date at time zone $3,$4::miclub.movement_type,a.sector_id,a.id,$5,$6,$7,$8,$9,$10,'pagado','COMPLETADO','finance_circuit',$11
      from miclub.activities a where a.club_id=$1 and a.id=$12 returning id`, [auth.clubId, date, timezone, debtCollection ? 'INGRESOS' : 'EGRESOS', debtCollection ? 'Cobro de deuda del responsable' : 'Liquidación de actividad', personId, row.personName, portion, account.currencyCode, accountId, group, row.activityId])).rows[0];
    await db.query("insert into miclub.activity_settlement_allocations(club_id,settlement_id,movement_id,allocation_type,amount,status,occurred_at,completed_at) values($1,$2,$3,'PAYMENT',$4,'COMPLETADO',$5,now())", [auth.clubId, row.id, movement.id, portion, date]);
    remaining = Math.round((remaining - portion) * 100) / 100;
  }
  if (remaining !== 0) throw financialError('No se pudo distribuir el pago completo.');
  return { groupId: group, amount, compensations: proposal.compensations };
}
