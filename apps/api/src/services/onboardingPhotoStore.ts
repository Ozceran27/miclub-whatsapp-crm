import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { getPostgresPool } from "../db/postgres.js";
import { withTenantTransaction } from "../db/transaction.js";

export const ONBOARDING_PHOTO_POLICY = {
  mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  maxBytes: 5 * 1024 * 1024,
  lifetimeMs: 24 * 60 * 60 * 1000,
};

const privateRoot = path.resolve(process.env.PRIVATE_UPLOAD_ROOT ?? path.join(tmpdir(), "miclub-private-uploads"));
const objectPath = (objectKey:string) => path.join(privateRoot, objectKey);

function imageSize(data:Buffer,mime:string):{width:number;height:number}|null {
  if(mime==="image/png" && data.length>=24 && data.subarray(1,4).toString()==="PNG") return {width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
  if(mime==="image/jpeg" && data[0]===0xff && data[1]===0xd8){for(let offset=2;offset+9<data.length;){if(data[offset]!==0xff){offset++;continue;}const marker=data[offset+1],length=data.readUInt16BE(offset+2);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {height:data.readUInt16BE(offset+5),width:data.readUInt16BE(offset+7)};if(length<2)break;offset+=2+length;}}
  if(mime==="image/webp" && data.length>=30 && data.subarray(0,4).toString()==="RIFF" && data.subarray(8,12).toString()==="WEBP"){
    const kind=data.subarray(12,16).toString();
    if(kind==="VP8X")return {width:1+data.readUIntLE(24,3),height:1+data.readUIntLE(27,3)};
    if(kind==="VP8 " && data.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a])))return {width:data.readUInt16LE(26)&0x3fff,height:data.readUInt16LE(28)&0x3fff};
    if(kind==="VP8L")return {width:1+(((data[22]&0x3f)<<8)|data[21]),height:1+(((data[24]&0x0f)<<10)|(data[23]<<2)|(data[22]>>6))};
  }
  return null;
}

async function removeExpired(clubId:string){
  const rows=await withTenantTransaction(clubId,async db=>(await db.query<{object_key:string}>(`update miclub.employee_photos set status='deleted',deleted_at=now(),updated_at=now() where club_id=$1 and status='temporary' and expires_at<=now() returning object_key`,[clubId])).rows,await getPostgresPool());
  await Promise.all(rows.map(row=>fs.rm(objectPath(row.object_key),{force:true})));
}

export async function storeOnboardingPhoto(clubId:string,data:Buffer,mimeType:string){
  if(!ONBOARDING_PHOTO_POLICY.mimeTypes.includes(mimeType as typeof ONBOARDING_PHOTO_POLICY.mimeTypes[number]))throw Object.assign(new Error("Formato no admitido. Usá JPG, PNG o WebP."),{code:"PHOTO_TYPE_UNSUPPORTED"});
  if(!data.length||data.length>ONBOARDING_PHOTO_POLICY.maxBytes)throw Object.assign(new Error("La foto supera el máximo de 5 MB."),{code:"PHOTO_SIZE_LIMIT"});
  const dimensions=imageSize(data,mimeType);if(!dimensions||dimensions.width>4096||dimensions.height>4096)throw Object.assign(new Error("La imagen no es válida o supera 4096 px."),{code:"PHOTO_INVALID"});
  await removeExpired(clubId);
  const id=randomUUID(),objectKey=`onboarding/${clubId}/${randomUUID()}`;
  await fs.mkdir(path.dirname(objectPath(objectKey)),{recursive:true,mode:0o700});await fs.writeFile(objectPath(objectKey),data,{mode:0o600,flag:"wx"});
  try{await withTenantTransaction(clubId,async db=>db.query(`insert into miclub.employee_photos(id,club_id,object_key,mime_type,byte_size,checksum_sha256,width,height,status,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,'temporary',now()+interval '24 hours')`,[id,clubId,objectKey,mimeType,data.length,createHash("sha256").update(data).digest("hex"),dimensions.width,dimensions.height]),await getPostgresPool());}
  catch(error){await fs.rm(objectPath(objectKey),{force:true});throw error;}
  return {fileId:id};
}

export async function deleteOnboardingPhoto(clubId:string,fileId:string){
  const row=await withTenantTransaction(clubId,async db=>(await db.query<{object_key:string}>(`update miclub.employee_photos set status='deleted',deleted_at=now(),updated_at=now() where id=$1 and club_id=$2 and status='temporary' returning object_key`,[fileId,clubId])).rows[0],await getPostgresPool());
  if(row)await fs.rm(objectPath(row.object_key),{force:true});
}
