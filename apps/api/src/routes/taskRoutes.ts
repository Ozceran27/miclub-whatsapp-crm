import { Router, type Request, type Response } from "express";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskInput } from "@miclub/shared";
import { requirePermission } from "../middleware/authorization.js";
import { archiveTask, createTask, listTasks, setTaskStatus, updateTask, type TaskActor, type TaskResult } from "../repositories/tasksRepository.js";
import asyncHandler from "./asyncHandler.js";
const router=Router(); const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(res:Response,status:number,code:string,message:string)=>res.status(status).json({ok:false,error:true,status,code,message});
const actor=(req:Request):TaskActor=>({userId:req.auth!.userId,membershipId:req.auth!.membershipId,clubId:req.auth!.clubId,requestId:req.requestId,ip:req.ip,userAgent:req.get("user-agent")});
const validDate=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
const parse=(body:Record<string,unknown>,partial:boolean,res:Response):Partial<TaskInput>|null=>{ const allowed=new Set(["updatedAt","title","description","priority","dueAt","assignedToUserId"]);
 if(Object.keys(body).some(k=>!allowed.has(k))||(!partial&&(typeof body.title!=="string"||!body.title.trim()))||(body.title!==undefined&&(typeof body.title!=="string"||!body.title.trim()))||
 (body.description!==undefined&&body.description!==null&&typeof body.description!=="string")||(body.priority!==undefined&&!TASK_PRIORITIES.includes(body.priority as never))||
 (body.dueAt!==undefined&&body.dueAt!==null&&!validDate(body.dueAt))||(body.assignedToUserId!==undefined&&body.assignedToUserId!==null&&(typeof body.assignedToUserId!=="string"||!UUID.test(body.assignedToUserId)))) { fail(res,400,"VALIDATION_ERROR","Datos de tarea inválidos."); return null; }
 return {...body,title:typeof body.title==="string"?body.title.trim():undefined} as Partial<TaskInput>; };
const version=(body:Record<string,unknown>,res:Response)=>{if(!validDate(body.updatedAt)){fail(res,400,"VALIDATION_ERROR","updatedAt es obligatorio y debe ser una fecha ISO.");return null;}return String(body.updatedAt)};
const respond=(res:Response,result:TaskResult)=>{if(result.kind==="created")return res.status(201).json(result.task);if(result.kind==="updated")return res.json(result.task);const e={missing:[404,"TASK_NOT_FOUND","Tarea no encontrada."],conflict:[409,"OPTIMISTIC_CONCURRENCY_CONFLICT","La tarea fue modificada; recargá el panel."],invalid_assignee:[400,"INVALID_ASSIGNEE","La persona asignada no pertenece al club."]} as const;const [s,c,m]=e[result.kind];return fail(res,s,c,m)};
router.get("/tasks",requirePermission("tasks.view"),asyncHandler(async(req,res)=>res.json({items:await listTasks(req.auth!.clubId)})));
router.post("/tasks",requirePermission("tasks.create"),asyncHandler(async(req,res)=>{const input=parse(req.body,false,res);if(input)return respond(res,await createTask(actor(req),input as TaskInput))}));
router.patch("/tasks/:id",requirePermission("tasks.edit"),asyncHandler(async(req,res)=>{const id=String(req.params.id);if(!UUID.test(id))return fail(res,400,"VALIDATION_ERROR","id inválido.");const v=version(req.body,res),input=parse(req.body,true,res);if(v&&input)return respond(res,await updateTask(actor(req),id,v,input))}));
router.patch("/tasks/:id/status",requirePermission("tasks.edit"),asyncHandler(async(req,res)=>{const id=String(req.params.id);if(!UUID.test(id)||Object.keys(req.body).some(k=>!["updatedAt","status"].includes(k))||!TASK_STATUSES.includes(req.body.status))return fail(res,400,"VALIDATION_ERROR","Estado o id inválido.");const v=version(req.body,res);if(v)return respond(res,await setTaskStatus(actor(req),id,v,req.body.status))}));
router.post("/tasks/:id/archive",requirePermission("tasks.edit"),asyncHandler(async(req,res)=>{const id=String(req.params.id);if(!UUID.test(id)||Object.keys(req.body).some(k=>k!=="updatedAt"))return fail(res,400,"VALIDATION_ERROR","Solicitud inválida.");const v=version(req.body,res);if(v)return respond(res,await archiveTask(actor(req),id,v))}));
export default router;
