import { Router, type Request, type Response } from "express";
import { requireAuthorizationCapability } from "../middleware/authorization.js";
import { createEnrollment, type EnrollmentActor, type EnrollmentInput } from "../repositories/enrollmentsRepository.js";
import asyncHandler from "./asyncHandler.js";

const router = Router();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actor=(req:Request):EnrollmentActor=>({userId:req.auth!.userId,membershipId:req.auth!.membershipId,clubId:req.auth!.clubId,requestId:req.requestId,ip:req.ip,userAgent:req.get("user-agent")});
const fail=(res:Response,status:number,code:string,message:string,details?:unknown)=>res.status(status).json({ok:false,error:true,status,code,message,details});

router.post("/inscripciones", requireAuthorizationCapability("ENROLLMENTS_CREATE"), asyncHandler(async(req,res)=>{
  const body=req.body as Record<string,unknown>;
  const allowed=new Set(["personId","activityId","feeAmount","status","dueDate","enrollmentDate"]);
  if(Object.keys(body).some(key=>!allowed.has(key))||!UUID.test(String(body.personId))||!UUID.test(String(body.activityId)))return fail(res,400,"VALIDATION_ERROR","Persona y actividad válidas son obligatorias.");
  const fee=Number(body.feeAmount); const status=String(body.status); const date=String(body.enrollmentDate);
  if(!Number.isFinite(fee)||fee<0||!["al_dia","nuevo_inscripto","adeudando"].includes(status)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||(body.dueDate!=null&&!/^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate))))return fail(res,400,"VALIDATION_ERROR","Cuota, estado y fechas no son válidos.");
  const result=await createEnrollment(actor(req),{personId:String(body.personId),activityId:String(body.activityId),feeAmount:fee,status,dueDate:body.dueDate?String(body.dueDate):null,enrollmentDate:date} as EnrollmentInput);
  if(result.kind==="invalid_reference")return fail(res,404,"REFERENCE_NOT_FOUND","No se encontraron la persona o la actividad.");
  if(result.kind==="duplicate")return fail(res,409,"ENROLLMENT_ALREADY_EXISTS","La persona ya tiene una inscripción activa en esta actividad.",result.enrollment);
  return res.status(201).json(result.enrollment);
}));
export default router;
