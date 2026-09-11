import type { RequestAuthContext } from '../auth/types.js';
import type { QueryExecutor } from '../db/postgres.js';
import { PERMISSIONS } from '@miclub/shared';
import { financialDate, financialError, financialMoney, loadCircuit, localDay } from './financialCircuitService.js';

type CashInput = { movementDate: string; movementType: 'INGRESOS' | 'EGRESOS'; accountId: string; categoryId: string; sectorId: string; activityId?: string | null; personId?: string | null; paymentMethodId?: string | null; concept: string; counterpartyText: string; amount: number; taxes?: number; operationalStatus?: 'COMPLETADO' | 'PENDIENTE' | 'ANULADO'; receivableId?: string | null };
type Movement = { id: string; revision: number; amount: number; currency_code: string; activity_id: string | null; person_id: string | null; sector_id: string; payment_method_id: string | null; movement_date: Date; operational_status: string; movement_type: string; account_id: string; receivable_id: string | null; initial_obligation_id: string | null };
const movementSelect = 'id,revision,amount::float8 amount,currency_code,activity_id,person_id,sector_id,payment_method_id,movement_date,operational_status::text,movement_type::text,account_id,receivable_id,initial_obligation_id';

async function movement(db: QueryExecutor, auth: RequestAuthContext, id: string): Promise<Movement> {
  const row = (await db.query<Movement>(`select ${movementSelect} from miclub.movements where club_id=$1 and id=$2 and ($3::uuid[] is null or sector_id=any($3)) for update`, [auth.clubId, id, auth.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : auth.sectorIds])).rows[0];
  if (!row) throw financialError('Movimiento no disponible.', 404);
  return row;
}

async function validateCash(db: QueryExecutor, auth: RequestAuthContext, input: CashInput) {
  financialDate(input.movementDate); financialMoney(input.amount); financialMoney(input.taxes ?? 0);
  if (input.amount <= 0 || !input.concept?.trim() || !input.counterpartyText?.trim() || !['INGRESOS', 'EGRESOS'].includes(input.movementType) || !['COMPLETADO', 'PENDIENTE', 'ANULADO'].includes(input.operationalStatus ?? 'COMPLETADO')) throw financialError('Complete tipo, concepto, contraparte, importe y estado.', 400);
  if (!auth.permissions.includes(PERMISSIONS.SECTORS_ANY) && !auth.sectorIds.includes(input.sectorId)) throw financialError('Sector no disponible.', 404);
  const reference = (await db.query<{ currency: string; timezone: string }>(`select f.currency_code currency,coalesce(c.timezone,'America/Argentina/Buenos_Aires') timezone
    from miclub.financial_accounts f join miclub.clubs c on c.id=f.club_id
    join miclub.sectors s on s.id=$3 and s.club_id=f.club_id
    join miclub.movement_categories cat on cat.id=$4 and cat.club_id=f.club_id and cat.direction::text=$5 and cat.is_active
    where f.club_id=$1 and f.id=$2 and f.status='ACTIVE'
    and ($6::uuid is null or exists(select 1 from miclub.activities a where a.club_id=$1 and a.id=$6 and a.sector_id=$3))
    and ($7::uuid is null or exists(select 1 from miclub.people p where p.club_id=$1 and p.id=$7))
    and ($8::uuid is null or exists(select 1 from miclub.payment_methods p where p.club_id=$1 and p.id=$8 and p.is_active))
    and ($9::uuid is null or exists(select 1 from miclub.receivables r where r.club_id=$1 and r.id=$9 and r.person_id=$7 and r.activity_id is not distinct from $6::uuid and r.currency_code=f.currency_code))`,
  [auth.clubId, input.accountId, input.sectorId, input.categoryId, input.movementType, input.activityId ?? null, input.personId ?? null, input.paymentMethodId ?? null, input.receivableId ?? null])).rows[0];
  if (!reference) throw financialError('Cuenta, categoría, sector o referencias no compatibles dentro del club.', 404);
  return reference;
}

export async function createFinancialMovement(db: QueryExecutor, auth: RequestAuthContext, input: CashInput, applications: { receivableId: string; amount: number }[] = []) {
  const reference = await validateCash(db, auth, input);
  const row = (await db.query<{ id: string }>(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,account_id,currency_code,category_id,sector_id,activity_id,person_id,payment_method_id,concept,counterparty_text,amount,taxes,operational_status,financial_status,source,receivable_id)
    values($1,miclub.next_tenant_sequence($1,'movement'),'finance:'||gen_random_uuid(),$2::date at time zone $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'otro','finance_circuit',$17) returning id`,
  [auth.clubId, input.movementDate, reference.timezone, input.movementType, input.accountId, reference.currency, input.categoryId, input.sectorId, input.activityId ?? null, input.personId ?? null, input.paymentMethodId ?? null, input.concept, input.counterpartyText, input.amount, input.taxes ?? 0, input.operationalStatus ?? 'COMPLETADO', input.receivableId ?? null])).rows[0];
  await synchronizePayment(db, auth, await movement(db, auth, row.id), applications);
  return { id: row.id };
}

export async function correctFinancialMovement(db: QueryExecutor, auth: RequestAuthContext, id: string, revision: number, input: CashInput, applications?: { receivableId: string; amount: number }[]) {
  const before = await movement(db, auth, id);
  if (before.revision !== revision) throw financialError('El movimiento cambió; revise su versión actual.');
  const reference = await validateCash(db, auth, input);
  const refund = (await db.query('select id from miclub.movement_refunds where club_id=$1 and refund_movement_id=$2', [auth.clubId, id])).rows[0];
  if (refund) return correctRefund(db, auth, before, input, reference, applications);
  const refundSum = (await db.query<{ amount: number }>(`select coalesce(sum(m.amount),0)::float8 amount from miclub.movement_refunds r join miclub.movements m on m.club_id=r.club_id and m.id=r.refund_movement_id where r.club_id=$1 and r.original_movement_id=$2 and m.operational_status='COMPLETADO' and m.voided_at is null`, [auth.clubId, id])).rows[0].amount;
  if (refundSum > 0 && (input.amount < refundSum || input.movementType !== 'INGRESOS' || input.operationalStatus === 'ANULADO' || input.operationalStatus === 'PENDIENTE' || input.activityId !== before.activity_id || input.personId !== before.person_id || reference.currency !== before.currency_code)) throw financialError('La corrección no puede invalidar devoluciones ya realizadas.');
  await db.query(`update miclub.movements set movement_date=$3::date at time zone $4,movement_type=$5,account_id=$6,currency_code=$7,category_id=$8,sector_id=$9,activity_id=$10,person_id=$11,payment_method_id=$12,concept=$13,counterparty_text=$14,amount=$15,taxes=$16,operational_status=$17::text::miclub.movement_status,receivable_id=$18,
    voided_at=case when $17='ANULADO' then now() else null end,voided_by=case when $17='ANULADO' then $19::uuid else null end,void_reason=case when $17='ANULADO' then current_setting('app.finance_reason') else null end,updated_at=now()
    where club_id=$1 and id=$2`, [auth.clubId, id, input.movementDate, reference.timezone, input.movementType, input.accountId, reference.currency, input.categoryId, input.sectorId, input.activityId ?? null, input.personId ?? null, input.paymentMethodId ?? null, input.concept, input.counterpartyText, input.amount, input.taxes ?? 0, input.operationalStatus ?? 'COMPLETADO', input.receivableId ?? null, auth.userId]);
  const allocations = (await db.query<{ id: string; settlement_id: string }>('select id,settlement_id from miclub.activity_settlement_allocations where club_id=$1 and movement_id=$2', [auth.clubId, id])).rows;
  if (allocations.length) {
    if (input.activityId !== before.activity_id || input.personId !== before.person_id || input.movementType !== before.movement_type || reference.currency !== before.currency_code) throw financialError('Un pago de liquidación conserva receptor, actividad y moneda; corrija importe, fecha o estado.');
    await db.query("update miclub.activity_settlement_allocations set amount=$3,status=case when $4='COMPLETADO' then 'COMPLETADO' when $4='ANULADO' then 'CANCELADO' else 'PENDIENTE' end where club_id=$1 and movement_id=$2", [auth.clubId, id, input.amount, input.operationalStatus ?? 'COMPLETADO']);
    await db.query("update miclub.activity_settlements set review_state='REQUIRES_REVIEW',revision=revision+1 where club_id=$1 and id=any($2::uuid[])", [auth.clubId, allocations.map(a => a.settlement_id)]);
  } else if (before.initial_obligation_id) {
    if ((input.activityId ?? null) !== before.activity_id || (input.personId ?? null) !== before.person_id || input.movementType !== before.movement_type || reference.currency !== before.currency_code || input.receivableId || applications?.length) throw financialError('La aplicación inicial conserva persona, actividad, tipo y moneda.');
    const oldApplied = before.operational_status === 'COMPLETADO' ? before.amount : 0;
    const newApplied = (input.operationalStatus ?? 'COMPLETADO') === 'COMPLETADO' ? input.amount : 0;
    await db.query('update miclub.initial_obligations set settled_amount=settled_amount+$3 where club_id=$1 and id=$2', [auth.clubId, before.initial_obligation_id, (newApplied - oldApplied) * (before.movement_type === 'EGRESOS' ? 1 : -1)]);
  } else await synchronizePayment(db, auth, await movement(db, auth, id), applications);
  await db.query(`update miclub.finance_startups set status='REQUIRES_REVIEW',revision=revision+1 where club_id=$1 and status='APPROVED' and ($2::date<=cutoff_date or $3::date<=cutoff_date)`, [auth.clubId, localDay(before.movement_date, reference.timezone), input.movementDate]);
  await loadCircuit(db, auth);
  return { id };
}

/** Payments and allocations are reconciled inside the same cash transaction. */
async function synchronizePayment(db: QueryExecutor, auth: RequestAuthContext, row: Movement, applications?: { receivableId: string; amount: number }[]) {
  const existing = (await db.query<{ id: string }>('select id from miclub.payments where club_id=$1 and movement_id=$2 for update', [auth.clubId, row.id])).rows[0];
  if (!existing && (row.movement_type !== 'INGRESOS' || !row.person_id)) {
    if (applications?.length) throw financialError('La aplicación de cuotas requiere un ingreso y una persona.', 400);
    return;
  }
  const refunded = (await db.query<{ amount: number }>(`select coalesce(sum(m.amount),0)::float8 amount from miclub.movement_refunds r join miclub.movements m on m.id=r.refund_movement_id and m.club_id=r.club_id where r.club_id=$1 and r.original_movement_id=$2 and m.operational_status='COMPLETADO' and m.voided_at is null`, [auth.clubId, row.id])).rows[0].amount;
  const amount = row.operational_status === 'COMPLETADO' && row.movement_type === 'INGRESOS' ? row.amount - refunded : 0;
  let paymentId = existing?.id;
  if (!paymentId) paymentId = (await db.query<{ id: string }>('insert into miclub.payments(club_id,movement_id,person_id,payment_method_id,paid_at,amount,currency_code) values($1,$2,$3,$4,$5,$6,$7) returning id', [auth.clubId, row.id, row.person_id, row.payment_method_id, row.movement_date, amount, row.currency_code])).rows[0].id;
  else await db.query('update miclub.payments set person_id=$3,payment_method_id=$4,paid_at=$5,amount=$6,currency_code=$7 where club_id=$1 and id=$2', [auth.clubId, paymentId, row.person_id, row.payment_method_id, row.movement_date, amount, row.currency_code]);
  const previous = (await db.query<{ id: string; receivable_id: string; amount: number }>('select id,receivable_id,amount::float8 amount from miclub.payment_allocations where club_id=$1 and payment_id=$2 order by created_at,id', [auth.clubId, paymentId])).rows;
  const desired = applications ?? previous.map(p => ({ receivableId: p.receivable_id, amount: p.amount }));
  let remaining = amount; const seen = new Set<string>();
  for (const a of desired) {
    financialMoney(a.amount);
    if (seen.has(a.receivableId)) throw financialError('Cuota duplicada en la aplicación.', 400);
    seen.add(a.receivableId);
    const due = (await db.query<{ available: number }>(`select (r.amount-r.cancelled_amount-coalesce((select sum(x.amount) from miclub.payment_allocations x where x.club_id=r.club_id and x.receivable_id=r.id and x.payment_id<>$3),0))::float8 available
      from miclub.receivables r where r.club_id=$1 and r.id=$2 and r.person_id=$4 and r.activity_id is not distinct from $5::uuid and r.currency_code=$6 for update`, [auth.clubId, a.receivableId, paymentId, row.person_id, row.activity_id, row.currency_code])).rows[0];
    if (!due) throw financialError('Cuota ajena a persona, actividad o moneda.', 404);
    const applied = applications ? a.amount : Math.min(a.amount, remaining, due.available);
    if (applied > remaining || applied > due.available) throw financialError('La aplicación supera el cobro o la deuda disponible.');
    const old = previous.find(p => p.receivable_id === a.receivableId);
    if (old) await db.query('update miclub.payment_allocations set amount=$3 where club_id=$1 and id=$2', [auth.clubId, old.id, applied]);
    else await db.query('insert into miclub.payment_allocations(club_id,payment_id,receivable_id,amount) values($1,$2,$3,$4)', [auth.clubId, paymentId, a.receivableId, applied]);
    remaining = Math.round((remaining - applied) * 100) / 100;
  }
  for (const old of previous.filter(p => !seen.has(p.receivable_id))) await db.query('update miclub.payment_allocations set amount=0 where club_id=$1 and id=$2', [auth.clubId, old.id]);
  await refreshReceivables(db, auth.clubId);
}

export async function refreshReceivables(db: QueryExecutor, clubId: string) {
  await db.query(`update miclub.receivables r set status=case when cancelled_amount=amount then 'cancelado'::miclub.receivable_status
    when amount-cancelled_amount <= coalesce((select sum(a.amount) from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id),0) then 'pagado'::miclub.receivable_status
    when exists(select 1 from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id and a.amount>0) then 'parcial'::miclub.receivable_status else 'pendiente'::miclub.receivable_status end,
    updated_at=now() where club_id=$1`, [clubId]);
}

export async function refundCollection(db: QueryExecutor, auth: RequestAuthContext, id: string, revision: number, amount: number, accountId: string, date: string) {
  financialMoney(amount); financialDate(date);
  const original = await movement(db, auth, id);
  if (original.revision !== revision) throw financialError('El cobro cambió; revise la versión actual.');
  if (original.movement_type !== 'INGRESOS' || original.operational_status !== 'COMPLETADO' || amount <= 0) throw financialError('La devolución requiere un cobro completado e importe positivo.');
  if (original.initial_obligation_id || (await db.query('select id from miclub.activity_settlement_allocations where club_id=$1 and movement_id=$2', [auth.clubId, id])).rows.length) throw financialError('El cobro de una deuda del responsable se corrige mediante su aplicación financiera.');
  const circuit = await loadCircuit(db, auth);
  const account = circuit.accounts.find(a => a.id === accountId && a.currencyCode === original.currency_code);
  if (!account) throw financialError('Cuenta incompatible con la moneda del cobro.', 404);
  const club = (await db.query<{ timezone: string }>("select coalesce(timezone,'America/Argentina/Buenos_Aires') timezone from miclub.clubs where id=$1", [auth.clubId])).rows[0];
  const collectedOn = localDay(original.movement_date, club.timezone);
  if (date < collectedOn) throw financialError('La devolución no puede preceder al cobro.');
  const previous = (await db.query<{ amount: number; responsible: number }>(`select coalesce(sum(m.amount),0)::float8 amount,coalesce(sum(r.responsible_amount),0)::float8 responsible from miclub.movement_refunds r join miclub.movements m on m.id=r.refund_movement_id and m.club_id=r.club_id where r.club_id=$1 and r.original_movement_id=$2 and m.operational_status='COMPLETADO'`, [auth.clubId, id])).rows[0];
  if (Math.round((previous.amount + amount) * 100) > Math.round(original.amount * 100)) throw financialError('La devolución supera el remanente disponible.');
  const term = original.activity_id ? (await db.query<{ id: string; mode: string; share: number; person_id: string | null }>(`select id,mode,club_share_percentage::float8 share,responsible_person_id person_id from miclub.activity_terms where club_id=$1 and activity_id=$2 and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)`, [auth.clubId, original.activity_id, collectedOn])).rows[0] : undefined;
  if (original.activity_id && !term?.person_id) throw financialError('Confirme el acuerdo y receptor originales antes de devolver.');
  const responsible = !term ? 0 : term.mode === 'FIXED' ? amount : Math.round((previous.amount + amount) * (100 - term.share)) / 100 - previous.responsible;
  const refundId = (await db.query<{ id: string }>(`insert into miclub.movements(club_id,sequence_number,external_id,movement_date,movement_type,sector_id,activity_id,person_id,concept,counterparty_text,amount,currency_code,account_id,operational_status,financial_status,source)
    values($1,miclub.next_tenant_sequence($1,'movement'),'refund:'||gen_random_uuid(),$2::date at time zone $3,'EGRESOS',$4,$5,$6,'Devolución de cobro','Devolución',$7,$8,$9,'COMPLETADO','pagado','finance_circuit') returning id`, [auth.clubId, date, club.timezone, original.sector_id, original.activity_id, original.person_id, amount, original.currency_code, accountId])).rows[0].id;
  await db.query('insert into miclub.movement_refunds(club_id,original_movement_id,refund_movement_id,original_term_id,responsible_amount,applications_tracked) values($1,$2,$3,$4,$5,true)', [auth.clubId, id, refundId, term?.id ?? null, Math.round(responsible * 100) / 100]);
  const allocations = (await db.query<{ id: string; receivable_id: string; amount: number }>(`select a.id,a.receivable_id,a.amount::float8 amount from miclub.payment_allocations a join miclub.payments p on p.id=a.payment_id and p.club_id=a.club_id where p.club_id=$1 and p.movement_id=$2 order by a.created_at,a.id`, [auth.clubId, id])).rows;
  let cancel = amount;
  for (const a of allocations) {
    const part = Math.min(cancel, a.amount); if (part <= 0) continue;
    await db.query('update miclub.payment_allocations set amount=amount-$3 where club_id=$1 and id=$2', [auth.clubId, a.id, part]);
    await db.query('update miclub.receivables set cancelled_amount=cancelled_amount+$3 where club_id=$1 and id=$2', [auth.clubId, a.receivable_id, part]);
    await db.query('insert into miclub.refund_obligation_applications(club_id,refund_movement_id,payment_allocation_id,receivable_id,amount) values($1,$2,$3,$4,$5)', [auth.clubId, refundId, a.id, a.receivable_id, part]);
    cancel = Math.round((cancel - part) * 100) / 100;
  }
  await synchronizePayment(db, auth, original);
  await loadCircuit(db, auth);
  return { id: refundId, amount, responsibleAmount: responsible, cancelledStudentAmount: amount - cancel };
}

async function correctRefund(db: QueryExecutor, auth: RequestAuthContext, before: Movement, input: CashInput, reference: { currency: string; timezone: string }, applications?: { receivableId: string; amount: number }[]) {
  const link = (await db.query<{ original_movement_id: string; original_term_id: string | null; applications_tracked: boolean }>('select original_movement_id,original_term_id,applications_tracked from miclub.movement_refunds where club_id=$1 and refund_movement_id=$2', [auth.clubId, before.id])).rows[0];
  if (!link.applications_tracked) throw financialError('Esta devolución histórica no tiene detalle de cuotas canceladas. Requiere conciliación explícita antes de corregirse.');
  const original = await movement(db, auth, link.original_movement_id);
  if (input.movementType !== 'EGRESOS' || (input.personId ?? null) !== before.person_id || (input.activityId ?? null) !== before.activity_id || reference.currency !== before.currency_code || input.receivableId || applications?.length || input.operationalStatus === 'PENDIENTE') throw financialError('La devolución conserva su cobro, persona, actividad y moneda; puede corregirse o anularse.');
  if (input.movementDate < localDay(original.movement_date, reference.timezone)) throw financialError('La devolución no puede preceder al cobro.');
  const effectiveAmount = input.operationalStatus === 'ANULADO' ? 0 : input.amount;
  const other = (await db.query<{ amount: number; responsible: number }>(`select coalesce(sum(m.amount),0)::float8 amount,coalesce(sum(r.responsible_amount),0)::float8 responsible from miclub.movement_refunds r join miclub.movements m on m.id=r.refund_movement_id and m.club_id=r.club_id where r.club_id=$1 and r.original_movement_id=$2 and m.id<>$3 and m.operational_status='COMPLETADO' and m.voided_at is null`, [auth.clubId, original.id, before.id])).rows[0];
  if (Math.round((effectiveAmount + other.amount) * 100) > Math.round(original.amount * 100)) throw financialError('La corrección excede el importe disponible para devolver.');
  const tracked = (await db.query<{ payment_allocation_id: string; receivable_id: string; amount: number }>('select payment_allocation_id,receivable_id,amount::float8 amount from miclub.refund_obligation_applications where club_id=$1 and refund_movement_id=$2', [auth.clubId, before.id])).rows;
  // Restore the receipt's available payment before restoring its applications;
  // PostgreSQL enforces the allocation ceiling after each statement.
  await db.query('update miclub.payments set amount=$3 where club_id=$1 and movement_id=$2', [auth.clubId, original.id, original.amount - other.amount]);
  for (const a of tracked) {
    await db.query('update miclub.receivables set cancelled_amount=cancelled_amount-$3 where club_id=$1 and id=$2 and cancelled_amount>=$3', [auth.clubId, a.receivable_id, a.amount]);
    await db.query('update miclub.payment_allocations set amount=amount+$3 where club_id=$1 and id=$2', [auth.clubId, a.payment_allocation_id, a.amount]);
  }
  await db.query('update miclub.refund_obligation_applications set amount=0 where club_id=$1 and refund_movement_id=$2', [auth.clubId, before.id]);
  const term = link.original_term_id ? (await db.query<{ mode: string; share: number }>('select mode,club_share_percentage::float8 share from miclub.activity_terms where club_id=$1 and id=$2', [auth.clubId, link.original_term_id])).rows[0] : null;
  const responsible = !term || !effectiveAmount ? 0 : term.mode === 'FIXED' ? effectiveAmount : Math.round((other.amount + effectiveAmount) * (100 - term.share)) / 100 - other.responsible;
  if (responsible < 0) throw financialError('La atribución original requiere revisar el acuerdo histórico.');
  await db.query(`update miclub.movements set movement_date=$3::date at time zone $4,amount=$5,account_id=$6,category_id=$7,payment_method_id=$8,concept=$9,counterparty_text=$10,taxes=$11,operational_status=$12::text::miclub.movement_status,voided_at=case when $12='ANULADO' then now() else null end,voided_by=case when $12='ANULADO' then nullif(current_setting('app.finance_actor',true),'')::uuid else null end,void_reason=case when $12='ANULADO' then current_setting('app.finance_reason') else null end,updated_at=now() where club_id=$1 and id=$2`, [auth.clubId, before.id, input.movementDate, reference.timezone, input.amount, input.accountId, input.categoryId, input.paymentMethodId ?? null, input.concept, input.counterpartyText, input.taxes ?? 0, input.operationalStatus ?? 'COMPLETADO']);
  await db.query('update miclub.movement_refunds set responsible_amount=$3 where club_id=$1 and refund_movement_id=$2', [auth.clubId, before.id, Math.round(responsible * 100) / 100]);
  const allocations = (await db.query<{ id: string; receivable_id: string; amount: number }>(`select a.id,a.receivable_id,a.amount::float8 amount from miclub.payment_allocations a join miclub.payments p on p.id=a.payment_id and p.club_id=a.club_id where p.club_id=$1 and p.movement_id=$2 order by a.created_at,a.id`, [auth.clubId, original.id])).rows;
  let remaining = effectiveAmount;
  for (const a of allocations) {
    const part = Math.min(remaining, a.amount); if (part <= 0) continue;
    await db.query('update miclub.payment_allocations set amount=amount-$3 where club_id=$1 and id=$2', [auth.clubId, a.id, part]);
    await db.query('update miclub.receivables set cancelled_amount=cancelled_amount+$3 where club_id=$1 and id=$2', [auth.clubId, a.receivable_id, part]);
    await db.query('insert into miclub.refund_obligation_applications(club_id,refund_movement_id,payment_allocation_id,receivable_id,amount) values($1,$2,$3,$4,$5) on conflict(club_id,refund_movement_id,payment_allocation_id) do update set amount=excluded.amount', [auth.clubId, before.id, a.id, a.receivable_id, part]);
    remaining = Math.round((remaining - part) * 100) / 100;
  }
  await synchronizePayment(db, auth, original);
  await db.query("update miclub.finance_startups set status='REQUIRES_REVIEW',revision=revision+1 where club_id=$1 and approved_snapshot is not null and ($2::date<=cutoff_date or $3::date<=cutoff_date)", [auth.clubId, localDay(before.movement_date, reference.timezone), input.movementDate]);
  await loadCircuit(db, auth);
  return { id: before.id, cancelledStudentAmount: effectiveAmount - remaining };
}

export async function abandonEnrollment(db: QueryExecutor, auth: RequestAuthContext, id: string, decision: 'KEEP' | 'FORGIVE', reason: string) {
  if (!['KEEP', 'FORGIVE'].includes(decision)) throw financialError('Elija conservar o perdonar la deuda.', 400);
  const row = (await db.query(`update miclub.enrollments e set inactive=true,inactive_at=now(),inactive_reason=$3,status='abandonado',status_override=true,end_date=current_date,debt_on_exit=$4
    where e.club_id=$1 and e.id=$2 and exists(select 1 from miclub.activities a where a.id=e.activity_id and a.club_id=e.club_id and ($5::uuid[] is null or a.sector_id=any($5))) returning id`, [auth.clubId, id, reason, decision, auth.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : auth.sectorIds])).rows[0];
  if (!row) throw financialError('Inscripción no disponible.', 404);
  if (decision === 'FORGIVE') await db.query(`update miclub.receivables r set cancelled_amount=greatest(cancelled_amount,amount-coalesce((select sum(a.amount) from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id),0)) where club_id=$1 and enrollment_id=$2`, [auth.clubId, id]);
  await refreshReceivables(db, auth.clubId);
  return { id, decision };
}
