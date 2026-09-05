import type { CommercialPlanCode } from "@miclub/shared";
import type { QueryExecutor } from "../db/postgres.js";

export type BillingMode="disabled"|"sandbox"|"live";
export type BillingSelection={status:"active";mode:BillingMode;source:"pre_billing_onboarding"};
export interface BillingService { prepareOnboardingSelection(planCode:CommercialPlanCode):BillingSelection }

const configurationError=(message:string,code:string)=>Object.assign(new Error(message),{code});
export const billingMode=():BillingMode=>{
 const value=(process.env.BILLING_MODE??"disabled").trim().toLowerCase();
 if(value!=="disabled"&&value!=="sandbox"&&value!=="live")throw configurationError("BILLING_MODE debe ser disabled, sandbox o live.","BILLING_MODE_INVALID");
 return value;
};

/** Temporary pre-billing boundary. Commercial plan codes are informative and
 * every onboarding selection is activated without collecting or confirming a payment. */
export const billingService:BillingService={prepareOnboardingSelection(planCode){
 const mode=billingMode();
 void planCode;
 return {status:"active",mode,source:"pre_billing_onboarding"};
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
