import { Router, type Request, type RequestHandler } from 'express';
import { PERMISSIONS } from '@miclub/shared';
import { requirePermission } from '../middleware/authorization.js';
import asyncHandler from './asyncHandler.js';
import { adjustSettlement, assertFinancialSchema, financeTransaction, financialError, financialMoney, previewResponsiblePayment, readFinancialCircuit, recordResponsiblePayment, resolveTerm, reviewSettlement, voidPayoutGroup, voidSettlementAdjustment } from '../services/financialCircuitService.js';
import { editEmployeeCompensationObligation, listEmployeeCompensationObligations, refreshEmployeeCompensationObligations, reviewEmployeeCompensationObligation } from '../services/employeeCompensationService.js';
import { abandonEnrollment, correctFinancialMovement, createFinancialMovement, refundCollection } from '../services/financialMovementService.js';
import { withTenantTransaction } from '../db/transaction.js';
import { approveStartup, previewStartup, reconcileMovement, payInitialObligation } from '../services/financialStartupService.js';

const router = Router();
const requireMovementCatalogAccess: RequestHandler = (req,res,next) => {
  if (!req.auth?.permissions.some(permission => permission===PERMISSIONS.MOVEMENTS_CREATE||permission===PERMISSIONS.FINANCE_CORRECT||permission===PERMISSIONS.FINANCE_PAY)) return res.status(403).json({code:'FORBIDDEN',message:'Permiso insuficiente'});
  next();
};
router.get('/finance/movement-catalogs', requireMovementCatalogAccess, asyncHandler(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId,async db=>{
    const club=req.auth!.clubId;
    const sectors=req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY)?null:req.auth!.sectorIds;
    const [categories,sectorRows,activities,paymentMethods,accounts]=await Promise.all([
      db.query(`select mc.id,mc.name,cc.code,cc.classification,cc.display_order "displayOrder",mc.is_active "isActive" from miclub.movement_categories mc join miclub.category_catalog cc on cc.id=mc.catalog_id and cc.is_active where mc.club_id=$1 and mc.is_active order by cc.display_order,mc.name`,[club]),
      db.query(`select id,name from miclub.sectors where club_id=$1 and ($2::uuid[] is null or id=any($2)) order by name`,[club,sectors]),
      db.query(`select id,name,sector_id "sectorId" from miclub.activities where club_id=$1 and ($2::uuid[] is null or sector_id=any($2)) order by name`,[club,sectors]),
      db.query(`select id,name from miclub.payment_methods where club_id=$1 and is_active order by name`,[club]),
      db.query(`select id,name,currency_code "currencyCode" from miclub.financial_accounts where club_id=$1 and status='ACTIVE' order by name`,[club]),
    ]);
    return {categories:categories.rows,sectors:sectorRows.rows,activities:activities.rows,paymentMethods:paymentMethods.rows,accounts:accounts.rows};
  }));
}));
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
const run = <T>(req: Request, action: Parameters<typeof financeTransaction<T>>[4]) => financeTransaction(req.auth!, text(req.get('idempotency-key')), { route: req.originalUrl, body: req.body as unknown }, text((req.body as Record<string,unknown>).reason), action);

router.get('/finance/workbench', requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId, async db => {
    await assertFinancialSchema(db);
    const club = req.auth!.clubId;
    const sectors = req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds;
    const categories = (await db.query(`select mc.id,mc.name,cc.code,cc.classification
      from miclub.movement_categories mc join miclub.category_catalog cc on cc.id=mc.catalog_id and cc.is_active
      where mc.club_id=$1 and mc.is_active order by cc.display_order,mc.name`, [club])).rows;
    const activities = (await db.query('select id,name,sector_id "sectorId" from miclub.activities where club_id=$1 and ($2::uuid[] is null or sector_id=any($2)) order by name', [club, sectors])).rows;
    const sectorRows = (await db.query('select id,name from miclub.sectors where club_id=$1 and ($2::uuid[] is null or id=any($2)) order by name', [club, sectors])).rows;
    const methods = (await db.query('select id,name from miclub.payment_methods where club_id=$1 and is_active order by name', [club])).rows;
    const startup = sectors === null && req.auth!.permissions.includes(PERMISSIONS.FINANCE_RECONCILE) ? (await db.query('select mode,cutoff_date::text "cutoffDate",revision,status,expected_balances preview,approved_snapshot from miclub.finance_startups where club_id=$1', [club])).rows[0] ?? null : null;
    const initialObligations = req.auth!.permissions.some(p => p === PERMISSIONS.FINANCE_RECONCILE || p === PERMISSIONS.FINANCE_PAY) && sectors === null ? (await db.query(`select id,review_state "reviewState",(amount-settled_amount)::float8 balance,source_key "sourceKey",person_id "personId",coalesce(activity_id::text,'') "activityId",kind,currency_code "currencyCode",amount::float8 amount,due_date::text "dueDate" from miclub.initial_obligations where club_id=$1 order by due_date,id`, [club])).rows : [];
    return { categories, activities, sectors: sectorRows, methods, startup, initialObligations };
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
router.get('/finance/movements/:id', requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId, async db => {
    const row = (await db.query(`select m.id,m.revision,m.amount::float8 amount,m.taxes::float8 taxes,
      (m.movement_date at time zone coalesce(c.timezone,'America/Argentina/Buenos_Aires'))::date::text "movementDate",
      m.movement_type "movementType",m.account_id "accountId",m.category_id "categoryId",m.sector_id "sectorId",
      m.activity_id "activityId",m.person_id "personId",m.payment_method_id "paymentMethodId",m.concept,
      m.counterparty_text "counterpartyText",m.operational_status "operationalStatus",m.receivable_id "receivableId",
      m.reconciled_at "reconciledAt",m.currency_code "currencyCode",m.voided_at "voidedAt"
      from miclub.movements m join miclub.clubs c on c.id=m.club_id
      where m.club_id=$1 and m.id=$2 and ($3::uuid[] is null or m.sector_id=any($3))`,
      [req.auth!.clubId, uuid(req.params.id), req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds])).rows[0];
    if (!row) throw financialError('Movimiento no disponible.', 404);
    const applications=(await db.query(`select a.receivable_id "receivableId",a.amount::float8 amount from miclub.payments p join miclub.payment_allocations a on a.payment_id=p.id and a.club_id=p.club_id where p.club_id=$1 and p.movement_id=$2 and a.amount>0 order by a.created_at,a.id`,[req.auth!.clubId,row.id])).rows;
    return {...row,applications};
  }));
}));
router.get('/finance/reconciliation/movements', requirePermission(PERMISSIONS.FINANCE_READ), requirePermission(PERMISSIONS.FINANCE_RECONCILE), asyncHandler(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw financialError('Página inválida.', 400);
  const status = req.query.status === 'all' ? 'all' : req.query.status === undefined || req.query.status === 'pending' ? 'pending' : null;
  if (!status) throw financialError('Estado de conciliación inválido.', 400);
  res.set('Cache-Control', 'private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId, async db => {
    const sectors = req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds;
    const where = `m.club_id=$1 and m.account_id is not null and m.operational_status='COMPLETADO' and m.voided_at is null
      and ($2::uuid[] is null or m.sector_id=any($2)) and ($3::text='all' or m.reconciled_at is null)`;
    const total = (await db.query<{ count: number }>(`select count(*)::int count from miclub.movements m where ${where}`, [req.auth!.clubId, sectors, status])).rows[0].count;
    const items = (await db.query(`select m.id,m.revision,m.movement_date "movementDate",m.movement_type "movementType",
      m.concept,m.amount::float8 amount,m.currency_code "currencyCode",a.name "accountName",m.reconciled_at "reconciledAt"
      from miclub.movements m join miclub.financial_accounts a on a.id=m.account_id and a.club_id=m.club_id
      where ${where} order by m.movement_date desc,m.id desc limit 20 offset $4`,
      [req.auth!.clubId, sectors, status, (page - 1) * 20])).rows;
    return { items, total, page, pageSize: 20 };
  }));
}));
router.get('/finance/history/:entity/:id', requirePermission(PERMISSIONS.FINANCE_READ), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const id = uuid(req.params.id);
  res.json(await withTenantTransaction(req.auth!.clubId, async db => (await db.query('select entity_type,entity_id,before_data,after_data,actor_id,reason,created_at from miclub.finance_history where club_id=$1 and entity_type=$2 and entity_id=$3 order by created_at desc', [req.auth!.clubId, String(req.params.entity), id])).rows));
}));
router.get('/finance/settlements/:id/adjustments', requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId, async db => {
    const sectors=req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY)?null:req.auth!.sectorIds;
    return (await db.query(`select x.id,x.amount::float8 amount,x.reason,x.status,x.revision,x.created_at "createdAt"
      from miclub.activity_settlement_adjustments x join miclub.activity_settlements s on s.id=x.settlement_id and s.club_id=x.club_id
      join miclub.activities a on a.id=s.activity_id and a.club_id=s.club_id
      where x.club_id=$1 and x.settlement_id=$2 and ($3::uuid[] is null or a.sector_id=any($3))
      order by x.created_at desc,x.id desc`,[req.auth!.clubId,uuid(req.params.id),sectors])).rows;
  }));
}));
router.post('/finance/terms/:id/resolve', requirePermission(PERMISSIONS.FINANCE_CORRECT), asyncHandler(async (req, res) => {
  const b = body(req, ['revision', 'personId']);
  res.json(await run(req, db => resolveTerm(db, req.auth!, uuid(req.params.id), revision(b.revision), uuid(b.personId))));
}));
for (const operation of ['approve', 'close'] as const) router.post(`/finance/settlements/:id/${operation}`, requirePermission(PERMISSIONS.FINANCE_REVIEW), asyncHandler(async (req, res) => {
  const b = body(req, ['revision']);
  res.json(await run(req, db => reviewSettlement(db, req.auth!, uuid(req.params.id), revision(b.revision), text(b.reason), operation === 'close')));
}));
router.post('/finance/responsibles/:id/preview', requirePermission(PERMISSIONS.FINANCE_PAY), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const b = body(req, ['accountId', 'amount', 'debtCollection']);
  if (typeof b.debtCollection !== 'boolean') throw financialError('Tipo de operación inválido.', 400);
  res.set('Cache-Control', 'private, no-store');
  res.json(await withTenantTransaction(req.auth!.clubId, db => previewResponsiblePayment(db, req.auth!, uuid(req.params.id), uuid(b.accountId), b.amount as number, b.debtCollection === true)));
}));
router.post('/finance/responsibles/:id/pay', requirePermission(PERMISSIONS.FINANCE_PAY), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req, res) => {
  const b = body(req, ['accountId', 'categoryId', 'paymentMethodId', 'amount', 'date', 'debtCollection', 'previewHash']);
  if (b.debtCollection !== undefined && typeof b.debtCollection !== 'boolean') throw financialError('Tipo de operación inválido.', 400);
  if (typeof b.previewHash !== 'string' || !/^[0-9a-f]{64}$/.test(b.previewHash)) throw financialError('Revise la vista previa antes de confirmar.', 400);
  const previewHash = b.previewHash;
  res.json(await run(req, db => recordResponsiblePayment(db, req.auth!, uuid(req.params.id), uuid(b.accountId), uuid(b.categoryId), uuid(b.paymentMethodId), b.amount as number, text(b.date), b.debtCollection === true, text(b.reason), previewHash)));
}));
router.post('/finance/settlements/:id/adjustments', requirePermission(PERMISSIONS.FINANCE_CORRECT), asyncHandler(async (req,res) => {
  const b=body(req,['revision','amount']); res.status(201).json(await run(req,db=>adjustSettlement(db,req.auth!,uuid(req.params.id),revision(b.revision),Number(b.amount),text(b.reason))));
}));
router.post('/finance/settlement-adjustments/:id/void', requirePermission(PERMISSIONS.FINANCE_CORRECT), asyncHandler(async (req,res) => {
  const b=body(req,['revision']); res.json(await run(req,db=>voidSettlementAdjustment(db,req.auth!,uuid(req.params.id),revision(b.revision),text(b.reason))));
}));
router.post('/finance/payout-groups/:id/void', requirePermission(PERMISSIONS.FINANCE_CORRECT), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req,res) => {
  const b=body(req,[]); res.json(await run(req,db=>voidPayoutGroup(db,req.auth!,uuid(req.params.id),text(b.reason))));
}));

router.get('/finance/compensation-obligations', requirePermission(PERMISSIONS.FINANCE_READ), asyncHandler(async (req,res) => {
  res.json(await withTenantTransaction(req.auth!.clubId,db=>listEmployeeCompensationObligations(db,req.auth!)));
}));
router.post('/finance/compensation-obligations/refresh', requirePermission(PERMISSIONS.FINANCE_REVIEW), asyncHandler(async (req,res) => {
  const b=body(req,['through']); res.json(await run(req,db=>refreshEmployeeCompensationObligations(db,req.auth!,b.through == null ? undefined : text(b.through))));
}));
router.patch('/finance/compensation-obligations/:id', requirePermission(PERMISSIONS.FINANCE_CORRECT), asyncHandler(async (req,res) => {
  const b=body(req,['revision','amount','periodFrom','periodTo','dueDate','sectorId']);
  const sectorId=b.sectorId==null?null:uuid(b.sectorId);
  res.json(await run(req,db=>editEmployeeCompensationObligation(db,req.auth!,uuid(req.params.id),revision(b.revision),{amount:Number(b.amount),periodFrom:text(b.periodFrom),periodTo:text(b.periodTo),dueDate:text(b.dueDate),sectorId},text(b.reason))));
}));
for (const operation of ['approve','cancel'] as const) router.post(`/finance/compensation-obligations/:id/${operation}`,requirePermission(PERMISSIONS.FINANCE_REVIEW),asyncHandler(async(req,res)=>{
  const b=body(req,['revision']); res.json(await run(req,db=>reviewEmployeeCompensationObligation(db,req.auth!,uuid(req.params.id),revision(b.revision),operation==='approve',text(b.reason))));
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
router.get('/finance/opening-balances',requirePermission(PERMISSIONS.FINANCE_RECONCILE),requirePermission(PERMISSIONS.SECTORS_ANY),asyncHandler(async(req,res)=>{
  res.json(await withTenantTransaction(req.auth!.clubId,async db=>{
    await assertFinancialSchema(db);
    const batch=(await db.query(`select id,revision,operation,status,replaces_batch_id "replacesBatchId",reconciliation_status "reconciliationStatus",idempotency_key "operationKey",created_by "createdBy",created_at "createdAt" from miclub.opening_balance_batches where club_id=$1 order by revision desc limit 1`,[req.auth!.clubId])).rows[0]??null;
    const movements=batch?(await db.query(`select m.id,m.account_id "accountId",a.code "accountCode",m.amount::float8 amount,m.currency_code "currencyCode",m.operational_status "status",m.voided_at "voidedAt",o.reverses_movement_id "reversesMovementId" from miclub.opening_balance_movements o join miclub.movements m on m.id=o.movement_id join miclub.financial_accounts a on a.id=m.account_id and a.club_id=m.club_id where m.club_id=$1 and o.batch_id=$2 order by a.code,m.id`,[req.auth!.clubId,batch.id])).rows:[];
    const revisions=(await db.query(`select id,previous_snapshot "previousSnapshot",replacement_snapshot "replacementSnapshot",reason,actor_id "actorId",created_at "createdAt" from miclub.opening_balance_revisions where club_id=$1 order by created_at desc limit 20`,[req.auth!.clubId])).rows;
    return {batch,movements,revisions};
  }));
}));
router.post('/finance/opening-balances/replace',requirePermission(PERMISSIONS.FINANCE_RECONCILE),requirePermission(PERMISSIONS.SECTORS_ANY),asyncHandler(async(req,res)=>{
  const b=body(req,['cash','bank','usdCash']);
  const values=[Number(b.cash),Number(b.bank),Number(b.usdCash)];values.forEach(financialMoney);const key=text(req.get('idempotency-key'));
  res.json(await run(req,async db=>{const previous=(await db.query(`select to_jsonb(x) snapshot from (select * from miclub.opening_balance_batches where club_id=$1 and status='APPLIED' order by revision desc limit 1)x`,[req.auth!.clubId])).rows[0]?.snapshot??null;const batch=(await db.query<{id:string}>(`select miclub.replace_opening_balances($1,$2,$3,$4,$5,$6) id`,[req.auth!.clubId,values[0],values[1],values[2],`${key}:opening`,req.auth!.userId])).rows[0];const replacement={batchId:batch.id,cash:values[0],bank:values[1],usdCash:values[2]};await db.query(`insert into miclub.opening_balance_revisions(club_id,operation_key,previous_snapshot,replacement_snapshot,reason,actor_id) values($1,$2,$3,$4,$5,$6) on conflict(club_id,operation_key) do nothing`,[req.auth!.clubId,key,previous,JSON.stringify(replacement),text(b.reason),req.auth!.userId]);return replacement;}));
}));
router.post('/finance/initial-obligations/:id/pay', requirePermission(PERMISSIONS.FINANCE_PAY), requirePermission(PERMISSIONS.SECTORS_ANY), asyncHandler(async (req,res) => {
  const b = body(req,['accountId','categoryId','amount','date']);
  res.json(await run(req,db => payInitialObligation(db,req.auth!,uuid(req.params.id),uuid(b.accountId),uuid(b.categoryId),b.amount as number,text(b.date))));
}));
router.post('/finance/movements/:id/reconcile', requirePermission(PERMISSIONS.FINANCE_RECONCILE), asyncHandler(async (req, res) => {
  const b = body(req, ['revision']);
  res.json(await run(req, db => reconcileMovement(db, req.auth!, uuid(req.params.id), revision(b.revision))));
}));
export default router;
