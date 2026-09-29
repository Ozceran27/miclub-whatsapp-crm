import { Router, type Request, type Response } from "express";
import { requireAuthorizationCapability } from "../middleware/authorization.js";
import { setEnrollmentStatus, type EnrollmentActor } from "../repositories/enrollmentsRepository.js";
import asyncHandler from "./asyncHandler.js";
import { financeTransaction } from "../services/financialCircuitService.js";
import { createOperationalEnrollment, previewEnrollmentPrice, type EnrollmentOperation } from "../services/enrollmentOperationsService.js";
import { withTenantTransaction } from "../db/transaction.js";

const router = Router();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actor=(req:Request):EnrollmentActor=>({userId:req.auth!.userId,membershipId:req.auth!.membershipId,clubId:req.auth!.clubId,requestId:req.requestId,ip:req.ip,userAgent:req.get("user-agent")});
const fail=(res:Response,status:number,code:string,message:string,details?:unknown)=>res.status(status).json({ok:false,error:true,status,code,message,details});

router.get('/inscripciones/pricing',requireAuthorizationCapability('ENROLLMENTS_CREATE'),asyncHandler(async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const activityId=typeof req.query.activityId==='string'?req.query.activityId:'';
  const date=typeof req.query.date==='string'?req.query.date:'';
  res.json(await withTenantTransaction(req.auth!.clubId,db=>previewEnrollmentPrice(db,req.auth!,activityId,date)));
}));

router.post("/inscripciones", requireAuthorizationCapability("ENROLLMENTS_CREATE"), asyncHandler(async(req,res)=>{
  const body=req.body as Record<string,unknown>;
  if(body && typeof body==='object' && !Array.isArray(body) && body.person && typeof body.person==='object') {
    const allowed=new Set(['personId','person','activityId','enrollmentDate','feeAmount','enrollmentPrice','initialPayment']);
    if(Object.keys(body).some(key=>!allowed.has(key))) return fail(res,400,'VALIDATION_ERROR','La inscripción contiene campos no editables.');
    const person=body.person as Record<string,unknown>;
    if(Array.isArray(person)||Object.keys(person).some(key=>!['firstName','lastName','document','phone'].includes(key))) return fail(res,400,'VALIDATION_ERROR','Datos de persona inválidos.');
    if(body.initialPayment!==undefined) {
      const payment=body.initialPayment as Record<string,unknown>;
      if(!payment||typeof payment!=='object'||Array.isArray(payment)||Object.keys(payment).some(key=>!['accountId','paymentMethodId','date','enrollmentAmount','feeAmount'].includes(key))||
        typeof payment.enrollmentAmount!=='number'||typeof payment.feeAmount!=='number'||payment.enrollmentAmount<0||payment.feeAmount<0||payment.enrollmentAmount+payment.feeAmount<=0)
        return fail(res,400,'VALIDATION_ERROR','Cobro inicial inválido.');
    }
    const key=req.get('idempotency-key');
    if(!key) return fail(res,400,'IDEMPOTENCY_KEY_REQUIRED','La clave de operación es obligatoria.');
    const result=await financeTransaction(req.auth!,key,{route:req.originalUrl,body},'Alta de inscripción',db=>
      createOperationalEnrollment(db,req.auth!,body as EnrollmentOperation));
    return res.status(201).json(result);
  }
  return fail(res,400,'ENROLLMENT_PERSON_REQUIRED','La inscripción requiere nombre, apellido, identificación y teléfono.');
}));

router.patch("/inscripciones/:id/estado", requireAuthorizationCapability("ENROLLMENTS_EDIT"), asyncHandler(async(req,res)=>{
  const body=req.body as Record<string,unknown>, id=String(req.params.id);
  const status=String(body.status), expected=String(body.expectedUpdatedAt);
  if (['abandonado','cancelado'].includes(status)) return fail(res,409,'FINANCIAL_WORKFLOW_REQUIRED','Registre la baja en Economía eligiendo conservar o perdonar la deuda y su motivo.');
  if(!UUID.test(id)||!['al_dia','nuevo_inscripto','adeudando','abandonado','cancelado'].includes(status)||typeof body.override!=="boolean"||Number.isNaN(new Date(expected).valueOf())) return fail(res,400,"VALIDATION_ERROR","Estado, override y versión esperada son obligatorios.");
  const result=await setEnrollmentStatus(actor(req),id,status,body.override,expected);
  if(result.kind==="missing")return fail(res,404,"ENROLLMENT_NOT_FOUND","No se encontró la inscripción.");
  if(result.kind==="conflict")return fail(res,409,"OPTIMISTIC_LOCK_CONFLICT","La inscripción fue modificada por otro usuario.");
  return res.json(result.enrollment);
}));
export default router;
