import {
  PROVISIONED_ONBOARDING_SECTORS,
  isSectorIconKey,
  SUPPORTED_OPERATIONAL_CURRENCIES,
  type CompleteOnboardingRequest,
  type OpeningBalancesRequest,
} from "@miclub/shared";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finiteNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const clientId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(value);

export const isOpeningBalancesRequest = (body: unknown): body is OpeningBalancesRequest => {
  if (!record(body)) return false;
  return !Object.keys(body).some((key) => !["currency", "cash", "bank", "usdCash", "idempotencyKey"].includes(key))
    && SUPPORTED_OPERATIONAL_CURRENCIES.some((currency) => currency === body.currency)
    && [body.cash, body.bank, body.usdCash].every(finiteNonNegative)
    && typeof body.idempotencyKey === "string" && Boolean(body.idempotencyKey.trim());
};

export const isCompleteOnboardingRequest = (body: unknown): body is CompleteOnboardingRequest => {
  if (!record(body) || Object.keys(body).some((key) => key !== "draft") || !record(body.draft)) return false;
  const draft = body.draft;
  if (typeof draft.idempotencyKey !== "string" || !/^[\w-]{8,128}$/.test(draft.idempotencyKey)) return false;
  if (!record(draft.openingBalances) || !isOpeningBalancesRequest({ ...draft.openingBalances, idempotencyKey: draft.idempotencyKey })) return false;
  if (!Array.isArray(draft.sectors) || !Array.isArray(draft.workers) || !Array.isArray(draft.activities)
    || draft.sectors.length > 100 || draft.workers.length > 100 || draft.activities.length > 200) return false;

  // IDs are request-local capabilities. Keeping one namespace prevents an
  // ambiguous reference from changing meaning between insertion phases.
  const allItems = [...draft.sectors, ...draft.workers, ...draft.activities];
  if (!allItems.every(record) || !allItems.every((item) => clientId(item.clientId))) return false;
  if (new Set(allItems.map((item) => item.clientId)).size !== allItems.length) return false;

  const requiredCodes = new Set<string>(PROVISIONED_ONBOARDING_SECTORS.map((sector) => sector.code));
  if (!draft.sectors.every((sector) =>
    typeof sector.code === "string" && Boolean(sector.code.trim())
    && typeof sector.isSystem === "boolean"
    && typeof sector.name === "string" && sector.name.trim().length > 0 && sector.name.length <= 120
    && isSectorIconKey(sector.iconKey)
    && typeof sector.color === "string" && /^#[0-9a-f]{6}$/i.test(sector.color)
    && ["active", "inactive", "under_repair"].includes(String(sector.status)))) return false;
  const systemSectors = draft.sectors.filter((sector) => sector.isSystem);
  if (systemSectors.some((sector) => !requiredCodes.has(sector.code))
    || [...requiredCodes].some((code) => systemSectors.filter((sector) => sector.code === code).length !== 1)
    || draft.sectors.some((sector) => !sector.isSystem && requiredCodes.has(sector.code))) return false;

  if (!draft.workers.every((worker) =>
    typeof worker.firstName === "string" && Boolean(worker.firstName.trim())
    && typeof worker.lastName === "string" && Boolean(worker.lastName.trim())
    && typeof worker.dni === "string" && /^\d{7,9}$/.test(worker.dni)
    && typeof worker.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(worker.email)
    && typeof worker.password === "string" && worker.password.length >= 10
    && ["TRABAJADOR", "INSTRUCTOR"].includes(String(worker.role))
    && ["FIXED", "VARIABLE"].includes(String(worker.paymentMode))
    && (worker.paymentMode === "FIXED" ? finiteNonNegative(worker.monthlyFixedAmount) : worker.monthlyFixedAmount == null))) return false;

  const sectorIds = new Set(draft.sectors.map((sector) => sector.clientId));
  const instructorIds = new Set(draft.workers.filter((worker) => worker.role === "INSTRUCTOR").map((worker) => worker.clientId));
  if (!draft.activities.every((activity) =>
    typeof activity.name === "string" && Boolean(activity.name.trim())
    && typeof activity.iconKey === "string"
    && typeof activity.color === "string" && /^#[0-9a-f]{6}$/i.test(activity.color)
    && typeof activity.sectorClientId === "string" && sectorIds.has(activity.sectorClientId)
    && (activity.instructorClientId === null || (typeof activity.instructorClientId === "string" && instructorIds.has(activity.instructorClientId)))
    && finiteNonNegative(activity.enrollmentFee)
    && ["FIXED", "VARIABLE"].includes(String(activity.settlementMode))
    && finiteNonNegative(activity.economicValue)
    && (activity.settlementMode !== "VARIABLE" || activity.economicValue <= 100)
    && ["active", "inactive"].includes(String(activity.status)))) return false;

  return draft.pendingImport === null
    || (record(draft.pendingImport) && Object.keys(draft.pendingImport).length === 1 && clientId(draft.pendingImport.batchId));
};
