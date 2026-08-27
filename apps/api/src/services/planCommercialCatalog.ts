import { COMMERCIAL_PLAN_CODES, type ClubCapabilityCode, type CommercialPlan, type CommercialPlanCode } from "@miclub/shared";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";

type Row={code:CommercialPlanCode;name:string;commercial_class:"free"|"paid";capabilities:ClubCapabilityCode[]|null};
export async function readCommercialPlanCatalog(executor?:QueryExecutor):Promise<CommercialPlan[]>{
 const db=executor??await getPostgresPool();
 const result=await db.query<Row>(`select plan.code,plan.name,plan.commercial_class,
   coalesce(array_agg(entitlement.feature_code order by entitlement.feature_code)
     filter (where entitlement.feature_code is not null),'{}') capabilities
  from miclub.plans plan left join miclub.plan_entitlements entitlement on entitlement.plan_code=plan.code
  where plan.catalog_status='catalog' and not plan.is_development
    and plan.code = any($1::text[])
  group by plan.code,plan.name,plan.commercial_class`,[COMMERCIAL_PLAN_CODES]);
 const byCode=new Map(result.rows.map(row=>[row.code,row]));
 if(COMMERCIAL_PLAN_CODES.some(code=>!byCode.has(code)))throw new Error("El catálogo comercial canónico está incompleto.");
 return COMMERCIAL_PLAN_CODES.map(code=>{const row=byCode.get(code)!;return {code,name:row.name,commercialClass:row.commercial_class,capabilities:row.capabilities??[]};});
}
export const isCommercialPlanCode=(value:string):value is CommercialPlanCode=>COMMERCIAL_PLAN_CODES.some(code=>code===value);
