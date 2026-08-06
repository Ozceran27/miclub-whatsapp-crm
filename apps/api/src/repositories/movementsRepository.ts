import { getPostgresPool } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

export type MovementRow = Record<string, unknown>;
export type MovementFilters = { from?: string; to?: string; type?: string; status?: string; sectorId?: string; personId?: string };
export type MovementQuery = MovementFilters & { clubId: string; limit: number; offset: number };

export const getMovements = async ({ clubId, limit, offset, from, to, type, status, sectorId, personId }: MovementQuery): Promise<{ rows: MovementRow[]; total: number }> => {
  const pool = await getPostgresPool();
  const result = await pool.query<MovementRow & { total_count: string | number }>(`
    select *, count(*) over() as total_count
    from miclub.v_movements_enriched
    where club_id = $1
      and ($2::timestamptz is null or movement_date >= $2)
      and ($3::timestamptz is null or movement_date < $3)
      and ($4::text is null or movement_type::text = $4)
      and ($5::text is null or operational_status::text = $5 or financial_status::text = $5)
      and ($6::uuid is null or sector_id = $6)
      and ($7::uuid is null or person_id = $7)
    order by movement_date desc nulls last, created_at desc nulls last, id desc nulls last
    limit $8 offset $9
  `, [clubId, from ?? null, to ?? null, type ?? null, status ?? null, sectorId ?? null, personId ?? null, limit, offset]);
  const total = Number(result.rows[0]?.total_count ?? 0);
  return { rows: result.rows.map(({ total_count: _, ...row }) => row), total };
};


export type MovementActor = { userId: string; membershipId: string; clubId: string; requestId?: string; ip?: string; userAgent?: string };
export type MovementInput = {
  movementDate: string; movementType: "INGRESOS" | "EGRESOS"; categoryId?: string | null; sectorId?: string | null;
  concept: string; personId?: string | null; counterpartyText?: string | null; amount: number; taxes?: number;
  paymentMethodId?: string | null; financialStatus?: string; operationalStatus?: "COMPLETADO" | "PENDIENTE";
};
export type MovementMutationResult = { kind: "created"; movement: MovementRow } | { kind: "updated"; movement: MovementRow }
  | { kind: "missing" } | { kind: "conflict" } | { kind: "protected"; reasons: string[] };

const movementColumns = `id, club_id, external_id, movement_date, movement_type, category_id, sector_id, concept,
  person_id, counterparty_text, amount, taxes, payment_method_id, financial_status, operational_status,
  source, source_payload, reconciled_at, voided_at, voided_by, void_reason, created_at, updated_at`;
const audit = (actor: MovementActor, action: string, before: MovementRow | null, after: MovementRow, db: Parameters<typeof auditService.movement>[1]) =>
  auditService.movement({ action, result: "success", userId: actor.userId, membershipId: actor.membershipId, clubId: actor.clubId,
    entityType: "movement", entityId: String(after.id), requestId: actor.requestId, ip: actor.ip, userAgent: actor.userAgent,
    oldData: before, newData: after }, db);

export const createMovement = async (actor: MovementActor, input: MovementInput): Promise<MovementMutationResult> => {
  const pool = await getPostgresPool();
  return withTransaction(async (db) => {
    const result = await db.query<MovementRow>(`insert into miclub.movements
      (club_id,external_id,movement_date,movement_type,category_id,sector_id,concept,person_id,counterparty_text,amount,taxes,payment_method_id,financial_status,operational_status,source)
      values ($1,'manual:'||gen_random_uuid(),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12,'otro'),coalesce($13,'COMPLETADO'),'manual') returning ${movementColumns}`,
      [actor.clubId,input.movementDate,input.movementType,input.categoryId??null,input.sectorId??null,input.concept,input.personId??null,input.counterpartyText??null,input.amount,input.taxes??0,input.paymentMethodId??null,input.financialStatus??null,input.operationalStatus??null]);
    await audit(actor,"movement.create",null,result.rows[0],db); return { kind:"created", movement:result.rows[0] };
  },pool);
};

const lockMovement = async (db: Parameters<typeof auditService.movement>[1] & { query: Function }, actor: MovementActor, id: string, expected: string) => {
  const result = await db.query(`select ${movementColumns}, exists(select 1 from miclub.payment_allocations pa where pa.movement_id=m.id) as linked_payment from miclub.movements m where m.club_id=$1 and m.id=$2 for update`,[actor.clubId,id]);
  const row=result.rows[0] as MovementRow|undefined; if(!row)return {kind:"missing" as const};
  if(new Date(String(row.updated_at)).toISOString()!==new Date(expected).toISOString())return {kind:"conflict" as const};
  const reasons=[]; if(row.reconciled_at)reasons.push("reconciled"); if(row.linked_payment)reasons.push("payment");
  if(reasons.length)return {kind:"protected" as const,reasons}; return {kind:"ok" as const,row};
};

export const updateMovement = async (actor: MovementActor,id:string,expected:string,input:MovementInput):Promise<MovementMutationResult> => {
  const pool=await getPostgresPool(); return withTransaction(async(db)=>{ const locked=await lockMovement(db,actor,id,expected); if(locked.kind!=="ok")return locked;
    const result=await db.query<MovementRow>(`update miclub.movements set movement_date=$3,movement_type=$4,category_id=$5,sector_id=$6,concept=$7,person_id=$8,counterparty_text=$9,amount=$10,taxes=$11,payment_method_id=$12,financial_status=$13,operational_status=$14,updated_at=now() where club_id=$1 and id=$2 and voided_at is null returning ${movementColumns}`,
      [actor.clubId,id,input.movementDate,input.movementType,input.categoryId??null,input.sectorId??null,input.concept,input.personId??null,input.counterpartyText??null,input.amount,input.taxes??0,input.paymentMethodId??null,input.financialStatus??"otro",input.operationalStatus??"COMPLETADO"]);
    if(!result.rows[0])return {kind:"conflict"}; await audit(actor,"movement.update",locked.row,result.rows[0],db); return {kind:"updated",movement:result.rows[0]}; },pool);
};

/** Financial facts are never deleted: deletion semantics are an auditable annulment. */
export const voidMovement = async(actor:MovementActor,id:string,expected:string,reason:string):Promise<MovementMutationResult>=>{const pool=await getPostgresPool();return withTransaction(async(db)=>{const locked=await lockMovement(db,actor,id,expected);if(locked.kind!=="ok")return locked;
  const result=await db.query<MovementRow>(`update miclub.movements set operational_status='ANULADO',voided_at=now(),voided_by=$3,void_reason=$4,updated_at=now() where club_id=$1 and id=$2 and voided_at is null returning ${movementColumns}`,[actor.clubId,id,actor.userId,reason]);
  if(!result.rows[0])return {kind:"conflict"};await audit(actor,"movement.void",locked.row,result.rows[0],db);return {kind:"updated",movement:result.rows[0]};},pool)};
