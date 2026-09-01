import type { CommercialPlanCode } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";

export type BillingMode="disabled"|"sandbox"|"live";
export type BillingSelection={status:"active"|"pending_payment";mode:BillingMode;source:"free"|"sandbox_onboarding"|"future_gateway"};
export interface BillingService { prepareOnboardingSelection(planCode:CommercialPlanCode):BillingSelection }

const configurationError=(message:string,code:string)=>Object.assign(new Error(message),{code});
export const billingMode=():BillingMode=>{
 const value=(process.env.BILLING_MODE??"disabled").trim().toLowerCase();
 if(value!=="disabled"&&value!=="sandbox"&&value!=="live")throw configurationError("BILLING_MODE debe ser disabled, sandbox o live.","BILLING_MODE_INVALID");
 return value;
};

const assertSandboxAllowed=()=>{
 if(process.env.NODE_ENV!=="production")return;
 const authorization=process.env.BILLING_SANDBOX_STAGING_AUTHORIZATION?.trim()??"";
 if(process.env.DEPLOYMENT_ENV!=="staging"||authorization.length<32)throw configurationError("Billing sandbox está prohibido en producción salvo autorización segura de staging.","BILLING_SANDBOX_FORBIDDEN");
};

/** Selection boundary: sandbox is an explicit simulation, while live only
 * reserves a subscription. No card or gateway secret is accepted here. */
export const billingService:BillingService={prepareOnboardingSelection(planCode){
 const mode=billingMode();
 if(planCode==="FREE")return {status:"active",mode,source:"free"};
 if(mode==="disabled")throw configurationError("Los planes pagos están deshabilitados. Podés continuar con Free.","PAID_PLAN_SELECTION_DISABLED");
 if(mode==="sandbox"){assertSandboxAllowed();return {status:"active",mode,source:"sandbox_onboarding"};}
 return {status:"pending_payment",mode,source:"future_gateway"};
}};

export type PaymentConfirmation={clubId:string;subscriptionId:string;gatewayEventId:string;authenticated:boolean};
/** Future gateway callback boundary. Its adapter must authenticate the event.
 * The event id and row lock make duplicate delivery harmless. */
export async function confirmLivePayment(db:QueryExecutor,input:PaymentConfirmation):Promise<boolean>{
 if(!input.authenticated)throw configurationError("La confirmación de pago no está autenticada.","PAYMENT_CONFIRMATION_UNAUTHENTICATED");
 const result=await db.query<{confirmed:boolean}>(`with claimed as (
   insert into miclub.billing_payment_confirmations(gateway_event_id,club_id,subscription_id)
   select $1,$2,$3 from miclub.club_subscriptions
   where id=$3 and club_id=$2 and selection_mode='live' and billing_status='pending_payment'
   on conflict (gateway_event_id) do nothing returning 1
 ), activated as (
   update miclub.club_subscriptions set billing_status='active',selection_source='authenticated_gateway_confirmation'
   where id=$3 and club_id=$2 and selection_mode='live' and billing_status='pending_payment'
     and exists(select 1 from claimed) returning 1
 ) select exists(select 1 from activated) confirmed`,[input.gatewayEventId,input.clubId,input.subscriptionId]);
 return result.rows[0]?.confirmed===true;
}
