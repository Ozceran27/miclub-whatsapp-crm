import { PERMISSIONS, isActivityPrice } from '@miclub/shared';
import type { RequestAuthContext } from '../auth/types.js';
import type { QueryExecutor } from '../db/postgres.js';
import { financialDate, financialError, financialMoney } from './financialCircuitService.js';
import { createFinancialMovement } from './financialMovementService.js';
import { feeCyclesInMonth, feeDueDate, type FeeFrequency } from './enrollmentCharges.js';

type PersonInput = { firstName:string; lastName:string; document:string; phone:string };
type InitialPayment = { accountId:string; paymentMethodId:string; date:string; enrollmentAmount:number; feeAmount:number };
export type EnrollmentOperation = { personId?:string; person:PersonInput; activityId:string; enrollmentDate:string; feeAmount?:number; enrollmentPrice?:number; initialPayment?:InitialPayment };
type EnrollmentRow = { id:string; person_id:string; activity_id:string; sector_id:string; enrollment_date:string; fee_frequency_snapshot:FeeFrequency|null; fee_price_snapshot:number; fee_amount:number; activity_price_term_id:string|null; status:string; inactive:boolean; end_date:string|null; document:string };
type Price = { id:string; enrollment_price:number; fee_price:number; fee_frequency:FeeFrequency; currency_code:string };
type Charge = {id:string;amount:number;currencyCode:string;created:boolean};
const uuid = (value:unknown) => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalizeDocument = (value:string) => value.trim().replace(/[.\s-]/g,'').toUpperCase();
const validPerson = (person:PersonInput) => person && typeof person.firstName==='string' && person.firstName.trim().length>0 && typeof person.lastName==='string' && person.lastName.trim().length>0 && typeof person.document==='string' && /^[A-Za-z0-9]{4,30}$/.test(normalizeDocument(person.document)) && typeof person.phone==='string' && person.phone.replace(/\D/g,'').length>=8;
const scope = (auth:RequestAuthContext,sectorId:string) => auth.permissions.includes(PERMISSIONS.SECTORS_ANY) || auth.sectorIds.includes(sectorId);

async function priceAt(db:QueryExecutor,clubId:string,activityId:string,date:string):Promise<Price|undefined> {
  return (await db.query<Price>(`select id,enrollment_price::float8 enrollment_price,fee_price::float8 fee_price,fee_frequency,currency_code
    from miclub.activity_price_terms where club_id=$1 and activity_id=$2 and cancelled_at is null
    and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)
    order by effective_from desc limit 1`,[clubId,activityId,date])).rows[0];
}

export async function previewEnrollmentPrice(db:QueryExecutor,auth:RequestAuthContext,activityId:string,date:string) {
  if(!uuid(activityId)) throw financialError('Actividad inválida.',400);
  financialDate(date);
  const activity=(await db.query<{sector_id:string}>(`select sector_id from miclub.activities where club_id=$1 and id=$2
    and status='activa'::miclub.entity_status and archived_at is null and generates_enrollments`,[auth.clubId,activityId])).rows[0];
  if(!activity||!scope(auth,activity.sector_id)) throw financialError('Actividad no disponible.',404);
  const price=await priceAt(db,auth.clubId,activityId,date);
  return price?{pricingConfigured:true,enrollmentPrice:price.enrollment_price,feePrice:price.fee_price,feeFrequency:price.fee_frequency,currencyCode:price.currency_code}
    :{pricingConfigured:false,enrollmentPrice:null,feePrice:null,feeFrequency:null,currencyCode:null};
}

async function category(db:QueryExecutor,clubId:string,code:'INSCRIPCION'|'CUOTA'):Promise<string> {
  const row=(await db.query<{id:string}>(`select mc.id from miclub.movement_categories mc
    join miclub.category_catalog cc on cc.id=mc.catalog_id
    where mc.club_id=$1 and mc.is_active and cc.is_active and cc.code=$2`,[clubId,code])).rows[0];
  if(!row) throw financialError(`Configure la categoría ${code} antes de cobrar.`,409);
  return row.id;
}

async function insertCharge(db:QueryExecutor,auth:RequestAuthContext,enrollment:{id:string;personId:string;activityId:string;sectorId:string},kind:'ENROLLMENT'|'FEE',dueDate:string,nextDueDate:string|null,amount:number,currencyCode:string,priceTermId:string|null,frequency?:FeeFrequency):Promise<Charge> {
  const key=kind==='ENROLLMENT'?`enrollment:${enrollment.id}`:`fee:${enrollment.id}:${dueDate}`;
  // The previous monthly generator used one charge per enrollment and calendar month.
  if(kind==='FEE' && frequency==='MONTHLY') {
    const old=(await db.query<{id:string;amount:number}>(`select id,amount::float8 amount from miclub.receivables
      where club_id=$1 and enrollment_id=$2 and period_month=extract(month from $3::date)
      and period_year=extract(year from $3::date) and charge_kind is null limit 1`,[auth.clubId,enrollment.id,dueDate])).rows[0];
    if(old) return {id:old.id,amount:old.amount,currencyCode,created:false};
  }
  const row=(await db.query<{id:string;amount:number}>(`insert into miclub.receivables
    (club_id,person_id,enrollment_id,activity_id,sector_id,concept,period_month,period_year,due_date,amount,currency_code,source_key,charge_kind,period_start,period_end,price_term_id,status)
    values($1,$2,$3,$4,$5,$6,extract(month from $7::date),extract(year from $7::date),$7,$8,$9,$10,$11,$7,$12,$13,$14::miclub.receivable_status)
    on conflict(club_id,source_key) where source_key is not null do nothing returning id,amount::float8 amount`,
    [auth.clubId,enrollment.personId,enrollment.id,enrollment.activityId,enrollment.sectorId,kind==='FEE'?`Cuota ${dueDate}`:'Inscripción',dueDate,amount,currencyCode,key,kind,nextDueDate?new Date(Date.parse(`${nextDueDate}T00:00:00Z`)-86400000).toISOString().slice(0,10):dueDate,priceTermId,amount===0?'pagado':'pendiente'])).rows[0];
  if(row) return {id:row.id,amount:row.amount,currencyCode,created:true};
  const existing=(await db.query<{id:string;amount:number}>(`select id,amount::float8 amount from miclub.receivables where club_id=$1 and source_key=$2`,[auth.clubId,key])).rows[0];
  if(!existing) throw financialError('No se pudo verificar la cuota existente.');
  return {id:existing.id,amount:existing.amount,currencyCode,created:false};
}

async function collect(db:QueryExecutor,auth:RequestAuthContext,entry:{personId:string;activityId:string;sectorId:string;document:string;name:string},charge:Charge,kind:'ENROLLMENT'|'FEE',amount:number,payment:{accountId:string;paymentMethodId:string;date:string;documentType?:'DNI'|'CUIL'|'REGISTRO';documentValue?:string}) {
  financialMoney(amount); financialDate(payment.date);
  if(amount<=0 || amount>charge.amount) throw financialError('El cobro supera el cargo disponible.',400);
  if(!uuid(payment.accountId)||!uuid(payment.paymentMethodId)) throw financialError('Cuenta y medio de pago son obligatorios.',400);
  return createFinancialMovement(db,auth,{
    movementDate:payment.date,movementType:'INGRESOS',accountId:payment.accountId,
    categoryId:await category(db,auth.clubId,kind==='FEE'?'CUOTA':'INSCRIPCION'),
    sectorId:entry.sectorId,activityId:entry.activityId,personId:entry.personId,
    paymentMethodId:payment.paymentMethodId,concept:kind==='FEE'?'Cobro de cuota':'Cobro de inscripción',
    counterpartyText:entry.name,counterpartyDocumentType:payment.documentType??'REGISTRO',counterpartyDocumentValue:payment.documentValue??entry.document,
    amount,operationalStatus:'COMPLETADO',receivableId:charge.id,
  },[{receivableId:charge.id,amount}]);
}

export async function createOperationalEnrollment(db:QueryExecutor,auth:RequestAuthContext,input:EnrollmentOperation) {
  if(!uuid(input.activityId)||!validPerson(input.person)||!financialDate(input.enrollmentDate)) throw financialError('Complete nombre, apellido, identificación, teléfono y actividad.',400);
  const person=input.person;
  const document=normalizeDocument(person.document);
  const activity=(await db.query<{sector_id:string}>(`select sector_id from miclub.activities where club_id=$1 and id=$2
    and status='activa'::miclub.entity_status and archived_at is null and generates_enrollments for update`,[auth.clubId,input.activityId])).rows[0];
  if(!activity||!scope(auth,activity.sector_id)) throw financialError('Actividad no disponible.',404);
  let personId=input.personId;
  if(personId) {
    if(!uuid(personId)) throw financialError('Persona inválida.',400);
    const existing=(await db.query<{id:string;first_name:string;last_name:string;dni:string|null;phone:string|null}>(`select id,first_name,last_name,dni,phone from miclub.people where club_id=$1 and id=$2 for update`,[auth.clubId,personId])).rows[0];
    if(!existing) throw financialError('Persona no disponible.',404);
    if(existing.dni&&normalizeDocument(existing.dni)!==document) throw financialError('La identificación no coincide con la persona seleccionada.',409);
    await db.query(`update miclub.people set dni=coalesce(dni,$3),phone=case when nullif(trim(phone),'') is null then $4 else phone end,
      first_name=case when nullif(trim(first_name),'') is null then $5 else first_name end,
      last_name=case when nullif(trim(last_name),'') is null then $6 else last_name end,
      updated_at=now() where club_id=$1 and id=$2`,[auth.clubId,personId,document,person.phone.trim(),person.firstName.trim(),person.lastName.trim()]);
  } else {
    const duplicate=(await db.query<{id:string}>(`select id from miclub.people where club_id=$1 and upper(regexp_replace(dni,'[.[:space:]-]','','g'))=$2 limit 1 for update`,[auth.clubId,document])).rows[0];
    if(duplicate) throw financialError('La persona ya existe. Seleccionala para inscribirla.',409);
    personId=(await db.query<{id:string}>(`insert into miclub.people(club_id,first_name,last_name,dni,phone)
      values($1,$2,$3,$4,$5) returning id`,[auth.clubId,person.firstName.trim(),person.lastName.trim(),document,person.phone.trim()])).rows[0].id;
  }
  const active=(await db.query<{id:string}>(`select id from miclub.enrollments where club_id=$1 and person_id=$2 and activity_id=$3
    and status not in ('abandonado','cancelado') and not coalesce(inactive,false) and superseded_at is null limit 1 for update`,[auth.clubId,personId,input.activityId])).rows[0];
  if(active) throw financialError('La persona ya tiene una inscripción activa en esta actividad.',409);
  const current=await priceAt(db,auth.clubId,input.activityId,input.enrollmentDate);
  const fee=current?.fee_price??input.feeAmount;
  const enrollmentPrice=current?.enrollment_price??input.enrollmentPrice;
  if(!isActivityPrice(fee)||!isActivityPrice(enrollmentPrice)) throw financialError('La actividad necesita precios vigentes o importes manuales válidos.',400);
  const frequency=current?.fee_frequency??'MONTHLY';
  const currencyCode=current?.currency_code??(await db.query<{base_currency_code:string}>('select base_currency_code from miclub.clubs where id=$1',[auth.clubId])).rows[0].base_currency_code;
  const enrollment=(await db.query<{id:string}>(`insert into miclub.enrollments
    (club_id,sequence_number,external_id,person_id,activity_id,fee_amount,normalized_fee_amount,enrollment_price_snapshot,fee_price_snapshot,fee_frequency_snapshot,activity_price_term_id,status,due_date,enrollment_date,source)
    values($1,miclub.next_tenant_sequence($1,'enrollment'),'manual:'||gen_random_uuid(),$2,$3,$4,$4,$5,$4,$6,$7,'nuevo_inscripto',$8,$8,'manual') returning id`,
    [auth.clubId,personId,input.activityId,fee,enrollmentPrice,frequency,current?.id??null,input.enrollmentDate])).rows[0];
  const base={id:enrollment.id,personId,activityId:input.activityId,sectorId:activity.sector_id};
  const signup=enrollmentPrice>0?await insertCharge(db,auth,base,'ENROLLMENT',input.enrollmentDate,null,enrollmentPrice,currencyCode,current?.id??null):null;
  const installment=await insertCharge(db,auth,base,'FEE',input.enrollmentDate,feeDueDate(input.enrollmentDate,frequency,1),fee,currencyCode,current?.id??null,frequency);
  const payment=input.initialPayment;
  const movements:string[]=[];
  if(payment) {
    if(!auth.permissions.includes(PERMISSIONS.MOVEMENTS_CREATE)) throw financialError('No tenés permiso para registrar el cobro inicial.',403);
    if(payment.enrollmentAmount>0&&signup) movements.push((await collect(db,auth,{...base,document,name:`${person.firstName.trim()} ${person.lastName.trim()}`},signup,'ENROLLMENT',payment.enrollmentAmount,payment)).id);
    else if(payment.enrollmentAmount>0) throw financialError('No existe un cargo de inscripción para cobrar.',400);
    if(payment.feeAmount>0) movements.push((await collect(db,auth,{...base,document,name:`${person.firstName.trim()} ${person.lastName.trim()}`},installment,'FEE',payment.feeAmount,payment)).id);
  }
  return {id:enrollment.id,personId,charges:[...(signup?[signup]:[]),installment],movementIds:movements};
}

export async function generateFeesForMonth(db:QueryExecutor,auth:RequestAuthContext,month:string,enrollmentId?:string) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||enrollmentId&&!uuid(enrollmentId)) throw financialError('Mes o inscripción inválidos.',400);
  const rows=(await db.query<EnrollmentRow>(`select e.id,e.person_id,e.activity_id,a.sector_id,
    coalesce(e.enrollment_date,e.created_at::date)::text enrollment_date,e.fee_frequency_snapshot,
    e.fee_price_snapshot::float8,e.fee_amount::float8,e.activity_price_term_id,e.status::text,e.inactive,e.end_date::text,p.dni document
    from miclub.enrollments e join miclub.activities a on a.id=e.activity_id and a.club_id=e.club_id
    join miclub.people p on p.id=e.person_id and p.club_id=e.club_id
    where e.club_id=$1 and ($2::uuid is null or e.id=$2) and e.status not in ('abandonado','cancelado')
    and not coalesce(e.inactive,false) and e.superseded_at is null
    and ($3::uuid[] is null or a.sector_id=any($3)) order by e.id`,
    [auth.clubId,enrollmentId??null,auth.permissions.includes(PERMISSIONS.SECTORS_ANY)?null:auth.sectorIds])).rows;
  if(enrollmentId&&!rows.length) throw financialError('Inscripción no disponible.',404);
  let generated=0,existing=0;
  const rejected:Array<{enrollmentId:string;reason:string}>=[];
  for(const row of rows) {
    const frequency=row.fee_frequency_snapshot??'MONTHLY';
    for(const cycle of feeCyclesInMonth(row.enrollment_date,frequency,month)) {
      if(row.end_date&&cycle.dueDate>row.end_date) continue;
      const price=await priceAt(db,auth.clubId,row.activity_id,cycle.dueDate);
      if(!price&&row.activity_price_term_id) { rejected.push({enrollmentId:row.id,reason:`Falta un precio vigente para ${cycle.dueDate}.`}); continue; }
      const amount=price?.fee_price??(row.fee_price_snapshot??row.fee_amount);
      if(!isActivityPrice(amount)) { rejected.push({enrollmentId:row.id,reason:'Precio de cuota no disponible.'}); continue; }
      const currencyCode=price?.currency_code??(await db.query<{base_currency_code:string}>('select base_currency_code from miclub.clubs where id=$1',[auth.clubId])).rows[0].base_currency_code;
      const charge=await insertCharge(db,auth,{id:row.id,personId:row.person_id,activityId:row.activity_id,sectorId:row.sector_id},'FEE',cycle.dueDate,cycle.nextDueDate,amount,currencyCode,price?.id??null,frequency);
      if(charge.created) generated++; else existing++;
    }
  }
  return {generated,existing,rejected};
}

export async function collectFee(db:QueryExecutor,auth:RequestAuthContext,input:{receivableId:string;amount:number;accountId:string;paymentMethodId:string;date:string;documentType?:'DNI'|'CUIL'|'REGISTRO';documentValue?:string}) {
  if(!uuid(input.receivableId)) throw financialError('Cuota inválida.',400);
  financialMoney(input.amount);
  const row=(await db.query<{id:string;amount:number;balance:number;currency_code:string;person_id:string;activity_id:string;sector_id:string;dni:string|null;first_name:string;last_name:string}>(`select r.id,r.amount::float8 amount,
    (r.amount-r.cancelled_amount-coalesce((select sum(a.amount) from miclub.payment_allocations a where a.club_id=r.club_id and a.receivable_id=r.id),0))::float8 balance,
    r.currency_code,r.person_id,r.activity_id,r.sector_id,p.dni,p.first_name,p.last_name
    from miclub.receivables r join miclub.people p on p.id=r.person_id and p.club_id=r.club_id
    where r.club_id=$1 and r.id=$2 and r.enrollment_id is not null
      and (r.charge_kind='FEE' or r.source_key like 'monthly:%' or (r.charge_kind is null and r.period_month is not null and r.period_year is not null)) for update`,[auth.clubId,input.receivableId])).rows[0];
  if(!row||!scope(auth,row.sector_id)) throw financialError('Cuota no disponible.',404);
  if(input.amount<=0||input.amount>row.balance) throw financialError('El pago debe ser positivo y no superar el saldo.',400);
  const document=input.documentValue?.trim()||row.dni;
  if(!document) throw financialError('Informe la identificación de la contraparte para cobrar.',400);
  const result=await collect(db,auth,{personId:row.person_id,activityId:row.activity_id,sectorId:row.sector_id,document,name:`${row.first_name} ${row.last_name}`.trim()},
    {id:row.id,amount:row.balance,currencyCode:row.currency_code,created:false},'FEE',input.amount,input);
  return {movementId:result.id,receivableId:row.id,paidAmount:input.amount};
}
