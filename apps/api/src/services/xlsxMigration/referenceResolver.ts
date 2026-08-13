import { createHash } from "node:crypto";
import { withTenantTransaction } from "../../db/transaction.js";
import { normalizeComparableText } from "../../importers/normalizers.js";
import type { MigrationIssue } from "./validator.js";

export type ImportReference = { id:string; name:string; code?:string|null };
export type ImportActivity = ImportReference & { sectorId:string; instructorId:string|null; modality?:string|null };
export type ReferenceCatalog = { sectors:ImportReference[]; activities:ImportActivity[]; instructors:ImportReference[] };
export type ReferenceRow = { sheet:string; rowNumber:number; sector?:unknown; activity?:unknown; modality?:unknown; instructor?:unknown; externalReference?:unknown; values:unknown[] };

const keys = (reference: ImportReference): string[] =>
  [...new Set([reference.name, reference.code].filter((value): value is string => Boolean(value)).map(normalizeComparableText))];

function resolve<T extends ImportReference>(items:T[], raw:unknown, notFound:string, field:string, row:ReferenceRow, issues:MigrationIssue[]):T|undefined {
  const key=normalizeComparableText(raw);
  if (!key) return undefined;
  const matches=items.filter((item)=>keys(item).includes(key));
  if (matches.length > 1) {
    issues.push({error_code:"REFERENCE_AMBIGUOUS",message:`${field} coincide con más de una referencia.`,severity:"error",sheet:row.sheet,row_number:row.rowNumber,field,value_normalized:key});
    return undefined;
  }
  if (!matches.length) issues.push({error_code:notFound,message:`No se encontró ${field} dentro del club de la sesión.`,severity:"error",sheet:row.sheet,row_number:row.rowNumber,field,value_normalized:key});
  return matches[0];
}

export function resolveReferenceRows(rows:ReferenceRow[], catalog:ReferenceCatalog) {
  const errors:MigrationIssue[]=[];
  const resolved=rows.map((row)=>{
    const sector=resolve(catalog.sectors,row.sector,"SECTOR_NOT_FOUND","sector",row,errors);
    const activityCandidates=row.modality === undefined ? catalog.activities : catalog.activities.filter((activity)=>normalizeComparableText(activity.modality)===normalizeComparableText(row.modality));
    const activity=resolve(activityCandidates,row.activity,"ACTIVITY_NOT_FOUND","activity",row,errors);
    const instructor=resolve(catalog.instructors,row.instructor,"INSTRUCTOR_NOT_FOUND","instructor",row,errors);
    if (sector&&activity&&activity.sectorId!==sector.id) errors.push({error_code:"ACTIVITY_SECTOR_MISMATCH",message:"La actividad no pertenece al sector de la fila.",severity:"error",sheet:row.sheet,row_number:row.rowNumber,field:"activity",value_normalized:normalizeComparableText(row.activity)});
    if (instructor&&activity&&activity.instructorId!==instructor.id) errors.push({error_code:"ACTIVITY_RESPONSIBLE_MISMATCH",message:"El responsable no es el responsable vigente de la actividad.",severity:"error",sheet:row.sheet,row_number:row.rowNumber,field:"instructor",value_normalized:normalizeComparableText(row.instructor)});
    const externalReference=String(row.externalReference??"").trim()||null;
    const rowFingerprint=createHash("sha256").update(JSON.stringify(row.values.map((value)=>normalizeComparableText(value)))).digest("hex");
    return {sheet:row.sheet,rowNumber:row.rowNumber,sectorId:sector?.id??null,activityId:activity?.id??null,instructorId:instructor?.id??null,externalReference,rowFingerprint};
  });
  return {errors,resolved};
}

export async function loadReferenceCatalog(clubId:string):Promise<ReferenceCatalog> {
  return withTenantTransaction(clubId,async(db)=>{
    const [sectors,activities,instructors]=await Promise.all([
      db.query<ImportReference>(`select id,name,code from miclub.sectors where club_id=$1 and archived_at is null`,[clubId]),
      db.query<{id:string;name:string;code:string|null;sector_id:string;instructor_id:string|null;modality:string|null}>(`select id,name,code,sector_id,instructor_id,modality from miclub.activities where club_id=$1 and archived_at is null`,[clubId]),
      db.query<ImportReference>(`select id,display_name as name,code from miclub.instructors where club_id=$1 and is_active=true`,[clubId]),
    ]);
    return {sectors:sectors.rows,activities:activities.rows.map((a)=>({id:a.id,name:a.name,code:a.code,sectorId:a.sector_id,instructorId:a.instructor_id,modality:a.modality})),instructors:instructors.rows};
  });
}
