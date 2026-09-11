import type { QueryExecutor } from '../db/postgres.js';
import type { RequestAuthContext } from '../auth/types.js';
import { PERMISSIONS } from '@miclub/shared';
import { financialDate, financialError, financialMoney } from './financialCircuitService.js';

type InitialObligation = { sourceKey: string; personId: string; activityId?: string | null; enrollmentId?: string | null; kind: 'STUDENT' | 'RESPONSIBLE' | 'EMPLOYEE' | 'SUPPLIER'; currencyCode: string; amount: number; dueDate: string };
type StartupInput = { mode: 'RECONSTRUCTION' | 'CUTOFF'; cutoffDate: string; accounts: { accountId: string; amount: number }[]; obligations: InitialObligation[] };
type Preview = StartupInput & { differences: { accountId: string; expected: number; imported: number; difference: number }[]; sourceHash: string };

async function sourceHash(db: QueryExecutor, clubId: string, cutoff: string) {
  return (await db.query<{ hash: string }>(`select md5(coalesce(string_agg(m.id::text||':'||m.revision::text,',' order by m.id),'')) hash
    from miclub.movements m join miclub.clubs c on c.id=m.club_id where m.club_id=$1 and (m.movement_date at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date<=$2::date`, [clubId, cutoff])).rows[0].hash;
}
export async function previewStartup(db: QueryExecutor, auth: RequestAuthContext, input: StartupInput) {
  financialDate(input.cutoffDate);
  if (!['RECONSTRUCTION', 'CUTOFF'].includes(input.mode) || !Array.isArray(input.accounts) || !Array.isArray(input.obligations)) throw financialError('Contrato de arranque inválido.', 400);
  const ids = new Set<string>();
  const differences: Preview['differences'] = [];
  for (const a of input.accounts) {
    financialMoney(Math.abs(a.amount));
    if (ids.has(a.accountId)) throw financialError('Cuenta inicial duplicada.', 400);
    ids.add(a.accountId);
    const actual = (await db.query<{ balance: number }>(`select coalesce(sum(case when m.movement_type='EGRESOS' then -m.amount else m.amount end),0)::float8 balance
      from miclub.financial_accounts a join miclub.clubs c on c.id=a.club_id left join miclub.movements m on m.club_id=a.club_id and m.account_id=a.id and m.operational_status='COMPLETADO' and m.voided_at is null
      and (m.movement_date at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date<=$3::date
      where a.club_id=$1 and a.id=$2 group by a.id`, [auth.clubId, a.accountId, input.cutoffDate])).rows[0];
    if (!actual) throw financialError('Cuenta inicial no disponible.', 404);
    differences.push({ accountId: a.accountId, expected: a.amount, imported: actual.balance, difference: Math.round((a.amount - actual.balance) * 100) / 100 });
  }
  const accountCount = (await db.query<{ count: number }>("select count(*)::int count from miclub.financial_accounts where club_id=$1 and status='ACTIVE'", [auth.clubId])).rows[0].count;
  if (ids.size !== accountCount) throw financialError('Incluya todas las cuentas activas, incluso con saldo cero.');
  const origins = new Set<string>();
  for (const o of input.obligations) {
    financialMoney(Math.abs(o.amount)); financialDate(o.dueDate);
    if (!o.sourceKey?.trim() || origins.has(o.sourceKey) || !['STUDENT', 'RESPONSIBLE', 'EMPLOYEE', 'SUPPLIER'].includes(o.kind) || (o.kind !== 'RESPONSIBLE' && o.amount < 0)) throw financialError('Obligación inicial inválida o identificador de origen repetido.', 400);
    origins.add(o.sourceKey);
    const valid = (await db.query(`select p.id from miclub.people p join miclub.currencies c on c.code=$3 where p.club_id=$1 and p.id=$2
      and ($4::uuid is null or exists(select 1 from miclub.activities a where a.club_id=$1 and a.id=$4))
      and ($5::uuid is null or exists(select 1 from miclub.enrollments e where e.club_id=$1 and e.id=$5 and e.person_id=$2 and e.activity_id=$4))`, [auth.clubId, o.personId, o.currencyCode, o.activityId ?? null, o.enrollmentId ?? null])).rows[0];
    if (!valid) throw financialError('Referencia de obligación inicial fuera del club o incompatible.', 404);
  }
  const preview: Preview = { ...input, differences, sourceHash: await sourceHash(db, auth.clubId, input.cutoffDate) };
  const row = (await db.query<{ revision: number }>(`insert into miclub.finance_startups(club_id,mode,cutoff_date,expected_balances)
    values($1,$2,$3,$4) on conflict(club_id) do update set expected_balances=excluded.expected_balances,
    revision=miclub.finance_startups.revision+1,status=case when miclub.finance_startups.approved_snapshot is null then 'DRAFT' else 'REQUIRES_REVIEW' end
    returning revision`, [auth.clubId, input.mode, input.cutoffDate, JSON.stringify(preview)])).rows[0];
  return { ...preview, revision: row.revision };
}

export async function approveStartup(db: QueryExecutor, auth: RequestAuthContext, revision: number, acceptDifferences: boolean) {
  const row = (await db.query<{ revision: number; expected_balances: Preview; approved_snapshot: Preview | null }>('select revision,expected_balances,approved_snapshot from miclub.finance_startups where club_id=$1 for update', [auth.clubId])).rows[0];
  if (!row || row.revision !== revision) throw financialError('La conciliación cambió; prepare una nueva comparación.');
  const preview = row.expected_balances;
  if (preview.sourceHash !== await sourceHash(db, auth.clubId, preview.cutoffDate)) throw financialError('Cambió la historia importada; vuelva a comparar antes de aprobar.');
  if (!acceptDifferences && preview.differences.some(d => d.difference !== 0)) throw financialError('Hay diferencias; requieren aceptación explícita con motivo.');
  const existingOrigins = (await db.query<{ source_key: string }>('select source_key from miclub.initial_obligations where club_id=$1', [auth.clubId])).rows;
  if (existingOrigins.some(o => !preview.obligations.some(p => p.sourceKey === o.source_key))) throw financialError('La comparación omite obligaciones ya conciliadas. Inclúyalas expresamente; no se eliminan saldos históricos al aprobar un arranque.');
  for (const o of preview.obligations) {
    const prior = (await db.query<{ id: string; person_id: string; activity_id: string | null; kind: string; currency_code: string; amount: number; settled_amount: number; receivable_id: string | null }>('select id,person_id,activity_id,kind,currency_code,amount::float8 amount,settled_amount::float8 settled_amount,receivable_id from miclub.initial_obligations where club_id=$1 and source_key=$2', [auth.clubId, o.sourceKey])).rows[0];
    if (prior && (prior.person_id !== o.personId || prior.activity_id !== (o.activityId ?? null) || prior.kind !== o.kind || prior.currency_code !== o.currencyCode || (prior.settled_amount !== 0 && prior.amount !== o.amount))) throw financialError('El origen ya tiene otra identidad o aplicaciones; requiere ajuste individual.');
    if (prior && prior.amount !== o.amount && (await db.query('select id from miclub.settlement_compensations where club_id=$1 and (debt_initial_obligation_id=$2 or credit_initial_obligation_id=$2) limit 1', [auth.clubId, prior.id])).rows.length) throw financialError('El saldo inicial ya participó de una compensación; conserve el origen y registre un ajuste separado.');
    if (prior?.receivable_id) {
      const applied = (await db.query<{ amount: number }>('select coalesce(sum(amount),0)::float8 amount from miclub.payment_allocations where club_id=$1 and receivable_id=$2', [auth.clubId, prior.receivable_id])).rows[0].amount;
      if (applied > 0 && prior.amount !== o.amount) throw financialError('La deuda inicial del alumno ya tiene pagos; corrija su obligación mediante un ajuste auditado.');
    }
    let receivableId = prior?.receivable_id ?? null;
    if (o.kind === 'STUDENT') {
      receivableId = (await db.query<{ id: string }>(`insert into miclub.receivables(club_id,person_id,activity_id,enrollment_id,concept,amount,due_date,currency_code,source_key)
        values($1,$2,$3,$4,'Deuda inicial conciliada',$5,$6,$7,$8) on conflict(club_id,source_key) where source_key is not null
        do update set amount=excluded.amount returning id`, [auth.clubId, o.personId, o.activityId ?? null, o.enrollmentId ?? null, o.amount, o.dueDate, o.currencyCode, `opening:${o.sourceKey}`])).rows[0].id;
    }
    await db.query(`insert into miclub.initial_obligations(club_id,person_id,activity_id,kind,currency_code,amount,source_key,due_date,receivable_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(club_id,source_key) do update set amount=excluded.amount,due_date=excluded.due_date,receivable_id=excluded.receivable_id,review_state='APPROVED'`, [auth.clubId, o.personId, o.activityId ?? null, o.kind, o.currencyCode, o.amount, o.sourceKey, o.dueDate, receivableId]);
  }
  await db.query('insert into miclub.finance_history(club_id,entity_type,entity_id,before_data,after_data,actor_id,reason) values($1,\'finance_startups\',$1,$2,$3,$4,current_setting(\'app.finance_reason\'))', [auth.clubId, JSON.stringify(row.approved_snapshot), JSON.stringify(preview), auth.userId]);
  await db.query("update miclub.finance_startups set mode=$2,cutoff_date=$3,status='APPROVED',approved_snapshot=$4,approved_by=$5,approved_at=now() where club_id=$1", [auth.clubId, preview.mode, preview.cutoffDate, JSON.stringify(preview), auth.userId]);
  return { approved: true, revision };
}

export async function reconcileMovement(db: QueryExecutor, auth: RequestAuthContext, id: string, revision: number) {
  const row = (await db.query(`update miclub.movements set reconciled_at=now() where club_id=$1 and id=$2 and revision=$3 and account_id is not null and operational_status='COMPLETADO'
    and ($4::uuid[] is null or sector_id=any($4)) returning id,revision,reconciled_at`, [auth.clubId, id, revision, auth.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : auth.sectorIds])).rows[0];
  if (!row) throw financialError('Movimiento cambiado, sin cuenta o no completado.');
  return row;
}

export async function payInitialObligation(db: QueryExecutor, auth: RequestAuthContext, id: string, accountId: string, amount: number, date: string) {
  financialMoney(amount); financialDate(date);
  const row = (await db.query<{ balance: number; person_id: string; activity_id: string | null; currency_code: string; timezone: string; today: string }>(`select (o.amount-o.settled_amount)::float8 balance,o.person_id,o.activity_id,o.currency_code,coalesce(c.timezone,'America/Argentina/Buenos_Aires') timezone,(now() at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date::text today
    from miclub.initial_obligations o join miclub.clubs c on c.id=o.club_id join miclub.financial_accounts a on a.club_id=o.club_id and a.id=$3 and a.currency_code=o.currency_code and a.status='ACTIVE'
    where o.club_id=$1 and o.id=$2 and o.kind in ('EMPLOYEE','SUPPLIER') and o.review_state='APPROVED' and exists(select 1 from miclub.finance_startups s where s.club_id=o.club_id and s.approved_snapshot is not null) for update of o`, [auth.clubId, id, accountId])).rows[0];
  if (!row) throw financialError('Obligación inicial aprobada o cuenta compatible no disponible.', 404);
  if (amount <= 0 || amount > row.balance || date > row.today) throw financialError('Importe superior al saldo, no positivo o fecha futura.');
  const created = (await db.query<{id:string}>(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,sector_id,activity_id,person_id,concept,counterparty_text,amount,currency_code,account_id,operational_status,financial_status,source,initial_obligation_id)
    values($1,miclub.next_tenant_sequence($1,'movement'),'finance:'||gen_random_uuid(),$2::date at time zone $3,'EGRESOS',(select sector_id from miclub.activities where club_id=$1 and id=$4),$4,$5,'Pago de obligación inicial','Empleado / proveedor',$6,$7,$8,'COMPLETADO','pagado','finance_circuit',$9) returning id`, [auth.clubId,date,row.timezone,row.activity_id,row.person_id,amount,row.currency_code,accountId,id])).rows[0];
  await db.query('update miclub.initial_obligations set settled_amount=settled_amount+$3 where club_id=$1 and id=$2', [auth.clubId,id,amount]);
  return { id: created.id, amount, remaining: Math.round((row.balance-amount)*100)/100 };
}
