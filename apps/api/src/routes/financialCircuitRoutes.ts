import { Router, type Request } from 'express';
import { PERMISSIONS, type PartialMonthPolicy } from '@miclub/shared';
import { requirePermission } from '../middleware/authorization.js';
import asyncHandler from './asyncHandler.js';
import { assertFinancialSchema, financeTransaction, financialError, readFinancialCircuit, recordResponsiblePayment, resolveTerm, reviewSettlement } from '../services/financialCircuitService.js';
import { abandonEnrollment, correctFinancialMovement, createFinancialMovement, refundCollection } from '../services/financialMovementService.js';
import { withTenantTransaction } from '../db/transaction.js';
import { approveStartup, previewStartup, reconcileMovement, payInitialObligation } from '../services/financialStartupService.js';

const router = Router();
router.get('/finance/accounts', requirePermission(PERMISSIONS.MOVEMENTS_CREATE), asyncHandler(async (req, res) => {
  res.json(await withTenantTransaction(req.auth!.clubId, async db => (await db.query("select id,name,currency_code as \"currencyCode\" from miclub.financial_accounts where club_id=$1 and status='ACTIVE' order by name", [req.auth!.clubId])).rows));
}));
const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw financialError('Identificador inválido.', 400);
  return value;
};
const text = (value: unknown): string => { if (typeof value !== 'string' || !value.trim()) throw financialError('Complete los campos obligatorios.', 400); return value.trim(); };
const revision = (value: unknown): number => { if (!Number.isInteger(value) || Number(value) < 1) throw financialError('Versión inválida.', 400); return Number(value); };
const applications = (value: unknown): { receivableId: string; amount: number }[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1000) throw financialError('Aplicaciones inválidas.', 400);
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw financialError('Aplicación inválida.', 400);
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(k => !['receivableId', 'amount'].includes(k)) || typeof row.amount !== 'number') throw financialError('Aplicación inválida.', 400);
    return { receivableId: uuid(row.receivableId), amount: row.amount };
  });
};
const body = (req: Request, allowed: string[]) => {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body as object).some(k => ![...allowed, 'reason'].includes(k))) throw financialError('La solicitud contiene campos no editables.', 400);
  return req.body as Record<string, unknown>;
};
const run = <T>(req: Request, action: Parameters<typeof financeTransaction<T>>[4]) => financeTransaction(req.auth!, text(req.get('idempotency-key')), { route: req.originalUrl, body: req.body }, text(req.body.reason), action);

router.get('/finance/workbench', requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId, async db => {
    await assertFinancialSchema(db);
    const club = req.auth!.clubId;
    const sectors = req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds;
    const movements = (await db.query(`select m.id,m.revision,m.amount::float8 amount,m.taxes::float8 taxes,
      (m.movement_date at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date::text "movementDate",
      m.movement_type "movementType",m.account_id "accountId",m.category_id "categoryId",m.sector_id "sectorId",m.activity_id "activityId",m.person_id "personId",m.payment_method_id "paymentMethodId",m.concept,m.counterparty_text "counterpartyText",m.operational_status "operationalStatus",m.receivable_id "receivableId",m.reconciled_at "reconciledAt"
      from miclub.movements m join miclub.clubs c on c.id=m.club_id where m.club_id=$1 and ($2::uuid[] is null or m.sector_id=any($2)) order by m.movement_date desc,m.id limit 100`, [club, sectors])).rows;
    const categories = (await db.query('select id,name,direction from miclub.movement_categories where club_id=$1 and is_active order by name', [club])).rows;
    const activities = (await db.query('select id,name,sector_id "sectorId" from miclub.activities where club_id=$1 and ($2::uuid[] is null or sector_id=any($2)) order by name', [club, sectors])).rows;
    const sectorRows = (await db.query('select id,name from miclub.sectors where club_id=$1 and ($2::uuid[] is null or id=any($2)) order by name', [club, sectors])).rows;
    const methods = (await db.query('select id,name from miclub.payment_methods where club_id=$1 and is_active order by name', [club])).rows;
    const receivables = (await db.query(`select r.id,r.person_id "personId",r.activity_id "activityId",r.concept,r.currency_code "currencyCode",
      greatest(0,r.amount-r.cancelled_amount-coalesce((select sum(a.amount) from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id),0))::float8 balance
      from miclub.receivables r where r.club_id=$1 and ($2::uuid[] is null or r.sector_id=any($2)) order by r.due_date,r.id`, [club, sectors])).rows;
    const enrollments = (await db.query(`select e.id,concat_ws(' ',p.first_name,p.last_name)||' — '||a.name name from miclub.enrollments e join miclub.people p on p.id=e.person_id and p.club_id=e.club_id join miclub.activities a on a.id=e.activity_id and a.club_id=e.club_id where e.club_id=$1 and not e.inactive and ($2::uuid[] is null or a.sector_id=any($2))`, [club, sectors])).rows;
    const startup = sectors === null && req.auth!.permissions.includes(PERMISSIONS.FINANCE_RECONCILE) ? (await db.query('select mode,cutoff_date::text "cutoffDate",revision,status,expected_balances preview,approved_snapshot from miclub.finance_startups where club_id=$1', [club])).rows[0] ?? null : null;
    const initialObligations = req.auth!.permissions.some(p => p === PERMISSIONS.FINANCE_RECONCILE || p === PERMISSIONS.FINANCE_PAY) && sectors === null ? (await db.query(`select id,review_state "reviewState",(amount-settled_amount)::float8 balance,source_key "sourceKey",person_id "personId",coalesce(activity_id::text,'') "activityId",kind,currency_code "currencyCode",amount::float8 amount,due_date::text "dueDate" from miclub.initial_obligations where club_id=$1 order by due_date,id`, [club])).rows : [];
    return { movements, categories, activities, sectors: sectorRows, methods, receivables, enrollments, startup, initialObligations };
  }));
}));

router.post('/finance/receivables/generate', requirePermission(PERMISSIONS.ENROLLMENTS_CREATE), asyncHandler(async (req, res) => {
  const b = body(req, ['month']);
  const month = text(b.month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw financialError('Mes inválido.', 400);
  res.json(await run(req, async db => {
    const result = await db.query(`insert into miclub.receivables(club_id,person_id,enrollment_id,activity_id,sector_id,concept,period_month,period_year,due_date,amount,currency_code,source_key)
      select e.club_id,e.person_id,e.id,e.activity_id,a.sector_id,'Cuota '||$2,extract(month from $3::date),extract(year from $3::date),$3,
      coalesce(e.normalized_fee_amount,e.fee_amount),c.base_currency_code,'monthly:'||e.id||':'||$2
      from miclub.enrollments e join miclub.activities a on a.id=e.activity_id and a.club_id=e.club_id join miclub.clubs c on c.id=e.club_id
      where e.club_id=$1 and not e.inactive and e.status::text not in ('abandonado','cancelado')
      and e.start_date<($3::date+interval '1 month') and (e.end_date is null or e.end_date>=$3::date)
      and ($4::uuid[] is null or a.sector_id=any($4))
      and not exists(select 1 from miclub.receivables r where r.club_id=e.club_id and r.enrollment_id=e.id and r.period_month=extract(month from $3::date) and r.period_year=extract(year from $3::date))
      on conflict(club_id,source_key) where source_key is not null do nothing returning id`, [req.auth!.clubId, month, `${month}-01`, req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds]);
    return { generated: result.rows.length };
  }));
}));

router.get('/finance/circuit', requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await readFinancialCircuit(req.auth!, req.query.month ? text(req.query.month) : undefined));
}));
router.get('/finance/history/:entity/:id', requirePermission(PERMISSIONS.FINANCE_READ), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const id = uuid(req.params.id);
  res.json(await withTenantTransaction(req.auth!.clubId, async db => (await db.query('select entity_type,entity_id,before_data,after_data,actor_id,reason,created_at from miclub.finance_history where club_id=$1 and entity_type=$2 and entity_id=$3 order by created_at desc', [req.auth!.clubId, String(req.params.entity), id])).rows));
}));
router.post('/finance/terms/:id/resolve', requirePermission(PERMISSIONS.FINANCE_CORRECT), asyncHandler(async (req, res) => {
  const b = body(req, ['revision', 'personId', 'partialMonthPolicy', 'distributions']);
  if (b.distributions !== undefined && !Array.isArray(b.distributions)) throw financialError('Distribución inválida.', 400);
  if (Array.isArray(b.distributions) && b.distributions.some((d: unknown) => !d || typeof d !== 'object' || typeof (d as Record<string, unknown>).month !== 'string' || typeof (d as Record<string, unknown>).amount !== 'number')) throw financialError('Distribución inválida.', 400);
  res.json(await run(req, db => resolveTerm(db, req.auth!, uuid(req.params.id), revision(b.revision), uuid(b.personId), (b.partialMonthPolicy ?? null) as PartialMonthPolicy | null, (b.distributions ?? []) as { month: string; amount: number }[])));
}));
for (const operation of ['approve', 'close'] as const) router.post(`/finance/settlements/:id/${operation}`, requirePermission(PERMISSIONS.FINANCE_REVIEW), asyncHandler(async (req, res) => {
  const b = body(req, ['revision']);
  res.json(await run(req, db => reviewSettlement(db, req.auth!, uuid(req.params.id), revision(b.revision), text(b.reason), operation === 'close')));
}));
router.post('/finance/responsibles/:id/pay', requirePermission(PERMISSIONS.FINANCE_PAY), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const b = body(req, ['accountId', 'amount', 'date', 'debtCollection']);
  if (b.debtCollection !== undefined && typeof b.debtCollection !== 'boolean') throw financialError('Tipo de operación inválido.', 400);
  res.json(await run(req, db => recordResponsiblePayment(db, req.auth!, uuid(req.params.id), uuid(b.accountId), b.amount as number, text(b.date), b.debtCollection === true)));
}));
const cashKeys = ['movementDate', 'movementType', 'accountId', 'categoryId', 'sectorId', 'activityId', 'personId', 'paymentMethodId', 'concept', 'counterpartyText', 'amount', 'taxes', 'operationalStatus', 'receivableId'];
const cash = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !cashKeys.includes(k))) throw financialError('Movimiento inválido o campos no editables.', 400);
  const v = value as Record<string, unknown>;
  for (const k of ['accountId', 'categoryId', 'sectorId']) uuid(v[k]);
  for (const k of ['activityId', 'personId', 'paymentMethodId', 'receivableId']) if (v[k] != null) uuid(v[k]);
  return v as Parameters<typeof createFinancialMovement>[2];
};
router.post('/finance/movements', requirePermission(PERMISSIONS.MOVEMENTS_CREATE), asyncHandler(async (req, res) => {
  const b = body(req, ['movement', 'applications']);
  res.status(201).json(await run(req, db => createFinancialMovement(db, req.auth!, cash(b.movement), applications(b.applications))));
}));
router.post('/finance/movements/:id/correct', requirePermission(PERMISSIONS.FINANCE_CORRECT), asyncHandler(async (req, res) => {
  const b = body(req, ['revision', 'movement', 'applications']);
  res.json(await run(req, db => correctFinancialMovement(db, req.auth!, uuid(req.params.id), revision(b.revision), cash(b.movement), applications(b.applications))));
}));
router.post('/finance/movements/:id/refund', requirePermission(PERMISSIONS.FINANCE_PAY), asyncHandler(async (req, res) => {
  const b = body(req, ['revision', 'amount', 'accountId', 'date']);
  res.json(await run(req, db => refundCollection(db, req.auth!, uuid(req.params.id), revision(b.revision), b.amount as number, uuid(b.accountId), text(b.date))));
}));
router.post('/finance/enrollments/:id/abandon', requirePermission(PERMISSIONS.ENROLLMENTS_CANCEL), asyncHandler(async (req, res) => {
  const b = body(req, ['decision']);
  res.json(await run(req, db => abandonEnrollment(db, req.auth!, uuid(req.params.id), b.decision as 'KEEP' | 'FORGIVE', text(b.reason))));
}));
router.post('/finance/startup/preview', requirePermission(PERMISSIONS.FINANCE_RECONCILE), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const b = body(req, ['mode', 'cutoffDate', 'accounts', 'obligations']);
  res.json(await run(req, db => previewStartup(db, req.auth!, b as unknown as Parameters<typeof previewStartup>[2])));
}));
router.post('/finance/startup/approve', requirePermission(PERMISSIONS.FINANCE_RECONCILE), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const b = body(req, ['revision', 'acceptDifferences']);
  res.json(await run(req, db => approveStartup(db, req.auth!, revision(b.revision), b.acceptDifferences === true)));
}));
router.post('/finance/initial-obligations/:id/pay', requirePermission(PERMISSIONS.FINANCE_PAY), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req,res) => {
  const b = body(req,['accountId','amount','date']);
  res.json(await run(req,db => payInitialObligation(db,req.auth!,uuid(req.params.id),uuid(b.accountId),b.amount as number,text(b.date))));
}));
router.post('/finance/movements/:id/reconcile', requirePermission(PERMISSIONS.FINANCE_RECONCILE), asyncHandler(async (req, res) => {
  const b = body(req, ['revision']);
  res.json(await run(req, db => reconcileMovement(db, req.auth!, uuid(req.params.id), revision(b.revision))));
}));
export default router;
