import { COMMERCIAL_PLAN_CODES, type ClubCapabilityCode, type CommercialPlan, type CommercialPlanCode } from "@miclub/shared";
import { getPostgresPool, type QueryExecutor } from "../db/postgres.js";

type Row={code:CommercialPlanCode;name:string;description:string;target_audience:string;highlighted_features:string[];display_order:number;recommended:boolean;cta_text:string;price_label:string;commercial_class:"free"|"paid";capabilities:ClubCapabilityCode[]|null};
export async function readCommercialPlanCatalog(executor?:QueryExecutor):Promise<CommercialPlan[]>{
 const db=executor??await getPostgresPool();
 const result=await db.query<Row>(`select plan.code,plan.name,plan.description,plan.target_audience,
   plan.highlighted_features,plan.display_order,plan.recommended,plan.cta_text,plan.price_label,plan.commercial_class,
   coalesce(array_agg(entitlement.feature_code order by entitlement.feature_code)
     filter (where entitlement.feature_code is not null),'{}') capabilities
  from miclub.plans plan left join miclub.plan_entitlements entitlement on entitlement.plan_code=plan.code
  where plan.catalog_status='catalog' and not plan.is_development
    and plan.code = any($1::text[])
  group by plan.code,plan.name,plan.description,plan.target_audience,plan.highlighted_features,
   plan.display_order,plan.recommended,plan.cta_text,plan.price_label,plan.commercial_class`,[COMMERCIAL_PLAN_CODES]);
 const byCode=new Map(result.rows.map(row=>[row.code,row]));
 if(COMMERCIAL_PLAN_CODES.some(code=>!byCode.has(code)))throw new Error("El catálogo comercial canónico está incompleto.");
 return [...byCode.values()].sort((a,b)=>a.display_order-b.display_order).map(row=>{const capabilities=row.capabilities??[];return {code:row.code,name:row.name,description:row.description,targetAudience:row.target_audience,highlightedFeatures:row.highlighted_features,displayOrder:row.display_order,recommended:row.recommended,ctaText:row.cta_text,priceLabel:row.price_label,commercialClass:row.commercial_class,capabilities,migrationAvailable:capabilities.includes('DATA_MIGRATION')};});
}
export const isCommercialPlanCode=(value:string):value is CommercialPlanCode=>COMMERCIAL_PLAN_CODES.some(code=>code===value);
