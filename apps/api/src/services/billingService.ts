import type { CommercialPlanCode } from "@miclub/shared";

export type BillingSelection={status:"active"|"pending_payment";source:"free"|"test_selection"|"future_gateway"};
export interface BillingService { prepareOnboardingSelection(planCode:CommercialPlanCode):BillingSelection }

/** Boundary for the future payment gateway. It never accepts card data and it
 * cannot pretend that production checkout succeeded. */
export const billingService:BillingService={prepareOnboardingSelection(planCode){
 if(planCode==="FREE")return {status:"active",source:"free"};
 if(process.env.NODE_ENV==="test")return {status:"active",source:"test_selection"};
 if(process.env.ONBOARDING_PAID_PLAN_SELECTION_ENABLED!=="true")throw Object.assign(new Error("Los planes pagos estarán disponibles cuando se integre el cobro. Podés continuar con Free."),{code:"PAID_PLAN_SELECTION_DISABLED"});
 return {status:"pending_payment",source:"future_gateway"};
}};
