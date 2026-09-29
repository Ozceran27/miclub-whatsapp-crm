import { PERMISSIONS } from "@miclub/shared";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { CrmDebt, PrepareMessagesRequest, PreparedMessage, PrepareMessagesValidation } from "@miclub/shared";
import { buildWaLink, normalizeArPhone } from "../services/messages.js";
import { createCrmTemplate, deleteCrmTemplate, findCrmDuplicatePreparedMessages, getCrmContactedRecent, getCrmHistory, listCrmTemplates, updateCrmHistoryStatus, updateCrmTemplate } from "../services/crmService.js";
import { requireMembership, requirePermission } from "../middleware/authorization.js";
import { isExplicitTestAuthBypass } from "../middleware/auth.js";
import { getArgentinaLastNDaysWindow } from "../domain/argentinaTime.js";
import { withTenantTransaction } from "../db/transaction.js";
import { crmDebtSortFields, getCrmDebtSummary, getCrmDebtsByIds, listCrmDebts } from "../repositories/crmDebtRepository.js";
import { crmHistorySortFields, getPreparedHistory, insertHistory } from "../repositories/crmRepository.js";

const getClubId = (req: Request): string => {
  if (req.auth?.clubId) return req.auth.clubId;
  throw new Error("Tenant context missing after authentication middleware");
};

const jsonError = (res: Response, status: number, message: string) =>
  res.status(status).json({ error: true, message });

const ALLOWED_TEMPLATE_VARIABLES = new Set(["{nombre}", "{apellido}", "{actividad}", "{cuota}", "{saldo}", "{vencimientos}", "{primer_vencimiento}", "{modalidad}", "{instructor}"]);
const validateTemplateInput = (name: unknown, body: unknown): string | null => {
  if (typeof name !== "string" || name.trim().length === 0) return "name no puede estar vacío.";
  if (typeof body !== "string" || body.trim().length === 0) return "body no puede estar vacío.";
  const variables = body.match(/\{\w+\}/g) ?? [];
  const invalidVariables = variables.filter((variable) => !ALLOWED_TEMPLATE_VARIABLES.has(variable.toLowerCase()));
  if (invalidVariables.length > 0) return `Variables inválidas en body: ${Array.from(new Set(invalidVariables)).join(", ")}.`;
  return null;
};

const unresolvedTemplateVariables = (message: string): string[] => {
  const variables = message.match(/\{\w+\}/g) ?? [];

  return Array.from(
    new Set(
      variables
        .map((token) => token.toLowerCase())
        .filter((token) => !ALLOWED_TEMPLATE_VARIABLES.has(token))
    )
  );
};

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sectorScope = (req: Request): readonly string[] | null => req.auth!.permissions.includes(PERMISSIONS.SECTORS_ANY) ? null : req.auth!.sectorIds;
const parsePage = (value: unknown): number | null => {
  if (value === undefined) return 1;
  const page=Number(value);
  return Number.isSafeInteger(page) && page>0 && page<=100000 ? page : null;
};

const validRequest=(body:Partial<PrepareMessagesRequest>):boolean=>Array.isArray(body.memberIds)
  && body.memberIds.length>0 && body.memberIds.length<=100 && body.memberIds.every(uuid)
  && new Set(body.memberIds).size===body.memberIds.length
  && typeof body.message==="string" && body.message.trim().length>0 && body.message.length<=4000;
const validPhone=(raw:string):boolean=>/^549\d{10}$/.test(normalizeArPhone(raw));
const fillDebtTemplate=(template:string,debt:CrmDebt):string=>{
  const balance=debt.balances.map(item=>`${item.amount.toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2})} ${item.currencyCode}`).join(" y ");
  const values:Record<string,string>={nombre:debt.firstName,apellido:debt.lastName,actividad:debt.activityName,
    cuota:balance,saldo:balance,vencimientos:String(debt.overdueCount),primer_vencimiento:debt.firstDueDate ?? "",
    modalidad:debt.modality,instructor:debt.instructor};
  return template.replace(/\{(\w+)\}/g,(_,key:string)=>values[key.toLowerCase()] ?? "");
};

export const createCrmRoutes = () => {
  const router = Router();
  if (!isExplicitTestAuthBypass()) router.use(requireMembership);
  const requireCrmWrite = isExplicitTestAuthBypass() ? (_req: Parameters<typeof requireMembership>[0], _res: Parameters<typeof requireMembership>[1], next: Parameters<typeof requireMembership>[2]) => next() : requirePermission(PERMISSIONS.CRM_WRITE);
  const requireCrmRead = isExplicitTestAuthBypass() ? (_req: Parameters<typeof requireMembership>[0], _res: Parameters<typeof requireMembership>[1], next: Parameters<typeof requireMembership>[2]) => next() : requirePermission(PERMISSIONS.CRM_READ);
  router.use(requireCrmRead);
  router.use((req,res,next)=>{if(req.method==="GET")res.set("Cache-Control","private, no-store");next();});

  router.get("/debts", async (req,res,next) => {
    const page=parsePage(req.query.page);
    const kind=req.query.kind === undefined ? "overdue" : req.query.kind;
    if (!page || typeof kind!=="string" || !["overdue","review","all"].includes(kind) ||
      (req.query.sectorId !== undefined && !uuid(req.query.sectorId)) ||
      (req.query.activityId !== undefined && !uuid(req.query.activityId)) ||
      (req.query.query !== undefined && (typeof req.query.query !== "string" || req.query.query.length>100)) ||
      (req.query.sortBy !== undefined && (typeof req.query.sortBy !== 'string' || !Object.hasOwn(crmDebtSortFields,req.query.sortBy))) ||
      (req.query.sortDirection !== undefined && (typeof req.query.sortDirection!=='string'||!['asc','desc'].includes(req.query.sortDirection))) ||
      (req.query.sortDirection !== undefined && req.query.sortBy === undefined)) return jsonError(res,400,"Filtros CRM inválidos.");
    try {
      const result=await withTenantTransaction(getClubId(req),db=>listCrmDebts(db,getClubId(req),sectorScope(req),{
        kind:kind as "overdue"|"review"|"all",page,pageSize:20,
        query:typeof req.query.query==="string"?req.query.query:undefined,
        sectorId:typeof req.query.sectorId==="string"?req.query.sectorId:undefined,
        activityId:typeof req.query.activityId==="string"?req.query.activityId:undefined,
        sortBy:typeof req.query.sortBy==='string'?req.query.sortBy as keyof typeof crmDebtSortFields:undefined,
        sortDirection:req.query.sortDirection==='desc'?'desc':'asc',
      }));
      res.set("Cache-Control","private, no-store").json(result);
    } catch(error){next(error);}
  });

  router.get("/debt-summary", async(req,res,next)=>{
    try {res.set("Cache-Control","private, no-store").json(await withTenantTransaction(getClubId(req),db=>getCrmDebtSummary(db,getClubId(req),sectorScope(req))));}
    catch(error){next(error);}
  });

  router.get("/catalog", async(req,res,next)=>{
    try {const catalog=await withTenantTransaction(getClubId(req),async db=>{
      const sectors=sectorScope(req);
      const rows=await db.query<{sectorId:string;sectorName:string;activityId:string;activityName:string}>(`
        select s.id "sectorId",s.name "sectorName",a.id "activityId",a.name "activityName"
        from miclub.activities a join miclub.sectors s on s.id=a.sector_id and s.club_id=a.club_id
        where a.club_id=$1 and ($2::uuid[] is null or s.id=any($2))
        order by s.name,a.name`,[getClubId(req),sectors]);
      return rows.rows;
    });res.set("Cache-Control","private, no-store").json(catalog);}catch(error){next(error);}
  });

  router.get("/eligibility/:id", async(req,res,next)=>{
    if(!uuid(req.params.id))return jsonError(res,400,"Inscripción inválida.");
    try {const rows=await withTenantTransaction(getClubId(req),db=>getCrmDebtsByIds(db,getClubId(req),sectorScope(req),[req.params.id]));
      const debt=rows[0];
      res.set("Cache-Control","private, no-store").json({eligible:rows.length===1,
        phone:debt?normalizeArPhone(debt.phone):null,balances:debt?.balances ?? [],overdueCount:debt?.overdueCount ?? 0});}
    catch(error){next(error);}
  });

  router.get("/prepared", async(req,res,next)=>{
    const page=parsePage(req.query.page);
    if(!page)return jsonError(res,400,"Página inválida.");
    try {res.set("Cache-Control","private, no-store").json(await getPreparedHistory(getClubId(req),sectorScope(req),page));}
    catch(error){next(error);}
  });

  router.get("/templates", async (req, res) => {
    try {
      res.json(await listCrmTemplates(getClubId(req)));
    } catch {
      jsonError(res, 500, "No se pudieron obtener las plantillas.");
    }
  });

  router.post("/templates", requireCrmWrite, async (req, res) => {
    const body = req.body as { name?: string; body?: string };
    const validationError = validateTemplateInput(body.name, body.body);
    if (validationError) return jsonError(res, 400, validationError);
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      const created = await createCrmTemplate(getClubId(req), body.name?.trim() ?? "", body.body?.trim() ?? "", id, now);
      res.status(201).json(created);
    } catch {
      jsonError(res, 500, "No se pudo crear la plantilla.");
    }
  });

  router.patch("/templates/:id", requireCrmWrite, async (req, res) => {
    const id = String(req.params.id);
    const body = req.body as { name?: string; body?: string };
    const validationError = validateTemplateInput(body.name, body.body);
    if (validationError) return jsonError(res, 400, validationError);
    try {
      const now = new Date().toISOString();
      const updated = await updateCrmTemplate(getClubId(req), id, body.name?.trim() ?? "", body.body?.trim() ?? "", now);
      if (!updated) return jsonError(res, 404, "Plantilla no encontrada.");
      res.json(updated);
    } catch {
      jsonError(res, 500, "No se pudo actualizar la plantilla.");
    }
  });

  router.delete("/templates/:id", requireCrmWrite, async (req, res) => {
    const id = String(req.params.id);
    try {
      const deleteResult = await deleteCrmTemplate(getClubId(req), id, req.auth?.userId ?? null);
      if (deleteResult === "missing") return jsonError(res, 404, "Plantilla no encontrada.");
      if (deleteResult === "default") return jsonError(res, 400, "No se pueden eliminar plantillas predeterminadas.");
      res.status(204).send();
    } catch {
      jsonError(res, 500, "No se pudo eliminar la plantilla.");
    }
  });

  router.get("/history", async (req, res) => {
    const pageRaw = Number.parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10);
    const pageSizeRaw = Number.parseInt(typeof req.query.pageSize === "string" ? req.query.pageSize : "20", 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 20) : 20;
    if ((req.query.sortBy !== undefined && (typeof req.query.sortBy!=='string'||!Object.hasOwn(crmHistorySortFields,req.query.sortBy))) ||
      (req.query.sortDirection!==undefined&&(typeof req.query.sortDirection!=='string'||!['asc','desc'].includes(req.query.sortDirection))) ||
      (req.query.sortDirection!==undefined&&req.query.sortBy===undefined)) return jsonError(res,400,"Orden CRM inválido.");

    try {
      res.set("Cache-Control","private, no-store").json(await getCrmHistory(getClubId(req), page, pageSize,sectorScope(req),
        req.query.sortBy as keyof typeof crmHistorySortFields|undefined,req.query.sortDirection==='desc'?'desc':'asc'));
    } catch {
      jsonError(res, 500, "No se pudo obtener el historial.");
    }
  });

  router.get("/contacted-recent", async (req, res) => {
    const windowDays = 30;
    const { from, to } = getArgentinaLastNDaysWindow(windowDays);
    const since = from.toISOString();
    const until = to.toISOString();

    try {
      res.json(await getCrmContactedRecent(getClubId(req), since, until, windowDays,sectorScope(req)));
    } catch {
      jsonError(res, 500, "No se pudo obtener contactos recientes.");
    }
  });

  router.post("/prepare-messages/validate", requireCrmWrite, async (req, res) => {
    const body = req.body as Partial<PrepareMessagesRequest>;
    if (!validRequest(body)) return jsonError(res, 400, "Selección o mensaje inválido.");
    try {
      const selected=await withTenantTransaction(getClubId(req),db=>getCrmDebtsByIds(db,getClubId(req),sectorScope(req),body.memberIds!));
      if(selected.length!==body.memberIds!.length)return jsonError(res,409,"La selección cambió o incluye inscripciones sin deuda autorizada.");
      const missingPhoneMembers=selected.filter(m=>!validPhone(m.phone)).map(m=>({memberId:m.enrollmentId,nombre:`${m.firstName} ${m.lastName}`}));
      const duplicateRows=await findCrmDuplicatePreparedMessages(getClubId(req),body.memberIds!);
      const seen=new Set<string>();
      const duplicates=duplicateRows.filter(row=>{if(seen.has(row.memberId))return false;seen.add(row.memberId);return true;});
      const response:PrepareMessagesValidation={selectedCount:selected.length,
        selectedPreview:selected.slice(0,3).map(m=>({memberId:m.enrollmentId,nombre:`${m.firstName} ${m.lastName}`,actividad:m.activityName,phone:m.phone})),
        missingPhoneMembers,unresolvedVariables:unresolvedTemplateVariables(body.message!),duplicates,
        sampleMessage:fillDebtTemplate(body.message!,selected[0])};
      res.json(response);
    }catch{return jsonError(res,500,"No se pudo validar la preparación.");}
  });

  router.post("/prepare-messages", requireCrmWrite, async (req, res) => {
    const body = req.body as Partial<PrepareMessagesRequest>;

    if (!validRequest(body)) return jsonError(res, 400, "Selección o mensaje inválido.");
    if(unresolvedTemplateVariables(body.message!).length)return jsonError(res,400,"El mensaje tiene variables desconocidas.");
    try {
      const prepared=await withTenantTransaction(getClubId(req),async db=>{
        // Payment application and preparation must serialize on the fee rows.
        await db.query(`select id from miclub.enrollments where club_id=$1 and id=any($2::uuid[]) order by id for update`,[getClubId(req),body.memberIds]);
        await db.query(`select id from miclub.receivables where club_id=$1 and enrollment_id=any($2::uuid[]) order by id for update`,[getClubId(req),body.memberIds]);
        const selected=await getCrmDebtsByIds(db,getClubId(req),sectorScope(req),body.memberIds!);
        if(selected.length!==body.memberIds!.length)throw Object.assign(new Error("La deuda cambió; actualizá la lista."),{status:409});
        if(selected.some(m=>!validPhone(m.phone)))throw Object.assign(new Error("Hay inscripciones sin teléfono argentino válido."),{status:409});
        const created:PreparedMessage[]=[];
        for(const member of selected){
          const message=fillDebtTemplate(body.message!,member);
          const phone=normalizeArPhone(member.phone);
          const row=await insertHistory(getClubId(req),{memberId:member.enrollmentId,personId:member.personId,
            enrollmentId:member.enrollmentId,nombre:`${member.firstName} ${member.lastName}`,actividad:member.activityName,
            phone,message,waLink:buildWaLink(phone,message),status:"prepared",createdAt:new Date().toISOString(),
            templateName:body.templateName?.trim() || null},db);
          created.push({...row,actividad:member.activityName});
        }
        return created;
      });
      res.json(prepared);
    } catch(error) {
      jsonError(res,(error as {status?:number}).status===409?409:500,error instanceof Error && (error as {status?:number}).status===409?error.message:"No se pudieron preparar los mensajes.");
    }
  });

  router.patch("/history/:id/status", requireCrmWrite, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: "prepared" | "opened" | "sent_manual" | "skipped"; note?: string | null };
    const validStatuses = new Set(["opened", "sent_manual", "skipped"]);

    if (!Number.isInteger(id) || id <= 0) return jsonError(res, 400, "id inválido.");
    if (!body.status || !validStatuses.has(body.status)) return jsonError(res, 400, "status inválido.");

    try {
      const updated = await updateCrmHistoryStatus(getClubId(req), id, body.status, body.note ?? null,sectorScope(req));
      if (!updated) return jsonError(res, 404, "Mensaje no encontrado.");
      res.json(updated);
    } catch {
      jsonError(res, 500, "No se pudo actualizar el estado del mensaje.");
    }
  });

  return router;
};
