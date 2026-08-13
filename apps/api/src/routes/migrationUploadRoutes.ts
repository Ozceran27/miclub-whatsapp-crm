import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { requireImportOperator, requireMembership } from "../middleware/authorization.js";
import asyncHandler from "./asyncHandler.js";
import { XLSX_POLICY, TEMPLATE_FILENAME } from "../services/xlsxMigration/policy.js";
import { validateWorkbook } from "../services/xlsxMigration/validator.js";
import { projectWrites } from "../services/xlsxMigration/projector.js";
import { saveBatch } from "../services/xlsxMigration/persistence.js";
import { loadReferenceCatalog, resolveReferenceRows } from "../services/xlsxMigration/referenceResolver.js";

const router=Router(); router.use(requireMembership,requireImportOperator);
const templatePath=path.resolve(process.cwd(),"apps/api/data/db",TEMPLATE_FILENAME);
router.get("/template",asyncHandler(async(_req,res)=>{ res.type(XLSX_POLICY.mime); res.set("Content-Disposition",`attachment; filename="${TEMPLATE_FILENAME}"`); res.set("X-Content-Type-Options","nosniff"); res.sendFile(templatePath); }));
function parsePart(raw:Buffer,boundary:string,name:string){ const marker=Buffer.from(`--${boundary}`); for(let at=raw.indexOf(marker);at>=0;at=raw.indexOf(marker,at+marker.length)){ const headersEnd=raw.indexOf(Buffer.from("\r\n\r\n"),at); if(headersEnd<0) break; const headers=raw.subarray(at,headersEnd).toString(); if(headers.includes(`name="${name}"`)){ const start=headersEnd+4,end=raw.indexOf(Buffer.from(`\r\n--${boundary}`),start); if(end<0) break; const filename=headers.match(/filename="([^"]*)"/)?.[1]; const mime=headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]; return {data:raw.subarray(start,end),filename,mime}; } } return null; }
router.post("/uploads",asyncHandler(async(req,res)=>{
 const contentType=req.get("content-type")??""; const boundary=contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
 if(!boundary) return res.status(400).json({code:"MULTIPART_REQUIRED",message:"Se requiere multipart/form-data."});
 const temp=path.join(tmpdir(),`miclub-upload-${req.requestId}.multipart`); let received=0;
 req.on("data",(chunk:Buffer)=>{received+=chunk.length;if(received>XLSX_POLICY.maxCompressedBytes+64*1024) req.destroy(new Error("UPLOAD_SIZE_LIMIT"));});
 try { await pipeline(req,createWriteStream(temp,{flags:"wx"})); const raw=await fs.readFile(temp); const file=parsePart(raw,boundary,"file");
  if(!file?.filename) return res.status(400).json({code:"FILE_REQUIRED",message:"Falta el campo file."});
  if(file.data.length>XLSX_POLICY.maxCompressedBytes) return res.status(413).json({code:"COMPRESSED_SIZE_LIMIT",message:"El archivo excede 8 MiB."});
  let validation; try { validation=validateWorkbook(file.data,file.filename,file.mime??""); } catch(error){ const code=typeof error==='object'&&error&&'code'in error?String(error.code):'INVALID_XLSX'; return res.status(422).json({code,message:error instanceof Error?error.message:"XLSX inválido."}); }
  const sha256=createHash("sha256").update(file.data).digest("hex"), writes=projectWrites(validation.rowCounts); const dry=parsePart(raw,boundary,"dryRunOfBatchId")?.data.toString().trim()||null; const idempotency=req.get("idempotency-key")?.trim()||null; const referenceConfigHash=createHash("sha256").update("xlsx-reference-config:v2").digest("hex");
  const operation=(req.get("x-import-operation")??(dry?"apply":"dry_run")).toLowerCase(); if(!["dry_run","apply","retry","reversal"].includes(operation)) return res.status(400).json({code:"INVALID_IMPORT_OPERATION",message:"Operación de importación inválida."});
  if(operation==="apply"&&!dry) return res.status(409).json({code:"MATCHING_DRY_RUN_REQUIRED",message:"La aplicación real requiere el identificador de un dry-run equivalente."});
  const references=resolveReferenceRows(validation.referenceRows,await loadReferenceCatalog(req.auth!.clubId)); validation.errors.push(...references.errors);
  const batchIdentity=createHash("sha256").update([sha256,XLSX_POLICY.templateVersion,req.auth!.clubId,operation].join(":"),"utf8").digest("hex");
  let batch; try { batch=await saveBatch({clubId:req.auth!.clubId,userId:req.auth!.userId,sha256,batchIdentity,operation,templateVersion:XLSX_POLICY.templateVersion,sourceFile:file.filename,idempotencyKey:idempotency,referenceConfigHash,dryRunOfBatchId:dry,rows:writes.total,projectedWrites:writes.total,errors:validation.errors,metadata:{sheets:validation.sheets,rowCounts:validation.rowCounts,writes,rows:references.resolved}}); } catch(error){ if(typeof error==='object'&&error&&'code'in error&&['MATCHING_DRY_RUN_REQUIRED','BATCH_ALREADY_EXECUTED'].includes(String(error.code))) return res.status(409).json({code:error.code,message:error instanceof Error?error.message:String(error)}); throw error; }
  res.status(validation.errors.length?422:200).json({...batch,fileSha256:sha256,templateVersion:XLSX_POLICY.templateVersion,rowCounts:validation.rowCounts,projectedWrites:writes,errors:validation.errors});
 } finally { await fs.rm(temp,{force:true}).catch(()=>undefined); }
}));
export default router;
