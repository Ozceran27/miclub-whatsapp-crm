import {
  PROVISIONED_ONBOARDING_SECTORS,
  ONBOARDING_DRAFT_CONTRACT_VERSION,
  COMMERCIAL_PLAN_CODES,
  isSectorIconKey,
  isActivityIconKey,
  SUPPORTED_OPERATIONAL_CURRENCIES,
  type CompleteOnboardingRequest,
  type OpeningBalancesRequest,
} from "@miclub/shared";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finiteNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const clientId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(value);

export const isOpeningBalancesRequest = (body: unknown): body is OpeningBalancesRequest => {
  if (!record(body)) return false;
  return !Object.keys(body).some((key) => !["currency", "cash", "bank", "usdCash", "idempotencyKey"].includes(key))
    && SUPPORTED_OPERATIONAL_CURRENCIES.some((currency) => currency === body.currency)
    && [body.cash, body.bank, body.usdCash].every(finiteNonNegative)
    && typeof body.idempotencyKey === "string" && Boolean(body.idempotencyKey.trim());
};

export const isCompleteOnboardingRequest = (body: unknown): body is CompleteOnboardingRequest => {
  if (!record(body) || Object.keys(body).some((key) => !["draft","selectedPlanCode"].includes(key)) || !record(body.draft)) return false;
  const draft = body.draft;
  if (draft.contractVersion !== ONBOARDING_DRAFT_CONTRACT_VERSION) return false;
  if (Object.keys(draft).some((key) => !["contractVersion","idempotencyKey","selectedPlanCode","openingBalances","sectors","workers","activities"].includes(key))) return false;
  if (typeof draft.idempotencyKey !== "string" || !/^[\w-]{8,128}$/.test(draft.idempotencyKey)) return false;
  if (!COMMERCIAL_PLAN_CODES.some((code) => code === draft.selectedPlanCode)) return false;
  if (body.selectedPlanCode !== draft.selectedPlanCode) return false;
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
    !Object.keys(sector).some((key) => !["clientId","code","name","iconKey","color","status","isSystem","capacityMode","configuredCapacity"].includes(key))
    && typeof sector.code === "string" && Boolean(sector.code.trim())
    && typeof sector.isSystem === "boolean"
    && typeof sector.name === "string" && sector.name.trim().length > 0 && sector.name.length <= 120
    && isSectorIconKey(sector.iconKey)
    && typeof sector.color === "string" && /^#[0-9a-f]{6}$/i.test(sector.color)
    && (sector.capacityMode === "ENROLLMENTS" ? positiveInteger(sector.configuredCapacity) : sector.capacityMode === "INCOME" && sector.configuredCapacity === null)
    && ["active", "inactive", "under_repair"].includes(String(sector.status)))) return false;
  const systemSectors = draft.sectors.filter((sector) => sector.isSystem);
  if (systemSectors.some((sector) => !requiredCodes.has(sector.code))
    || [...requiredCodes].some((code) => systemSectors.filter((sector) => sector.code === code).length !== 1)
    || draft.sectors.some((sector) => !sector.isSystem && requiredCodes.has(sector.code))) return false;

  if (!draft.workers.every((worker) =>
    !Object.keys(worker).some((key) => !["clientId","firstName","lastName","dni","phone","email","password","role","sectorId","hasFixedCompensation","fixedCompensationAmount","fixedCompensationFrequency","currencyCode","employmentStartDate","notes","photoFileId"].includes(key))
    && (worker.photoFileId == null || clientId(worker.photoFileId))
    && typeof worker.firstName === "string" && Boolean(worker.firstName.trim())
    && typeof worker.lastName === "string" && Boolean(worker.lastName.trim())
    && typeof worker.dni === "string" && /^\d{7,9}$/.test(worker.dni)
    && typeof worker.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(worker.email)
    && typeof worker.password === "string" && worker.password.length >= 10
    && ["TRABAJADOR", "INSTRUCTOR"].includes(String(worker.role))
    && typeof worker.hasFixedCompensation === "boolean"
    && (worker.hasFixedCompensation
      ? finiteNonNegative(worker.fixedCompensationAmount) && ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(worker.fixedCompensationFrequency)) && SUPPORTED_OPERATIONAL_CURRENCIES.includes(worker.currencyCode as never)
      : worker.fixedCompensationAmount == null && worker.fixedCompensationFrequency == null && worker.currencyCode == null))) return false;

  const sectorIds = new Set(draft.sectors.map((sector) => sector.clientId));
  const instructorIds = new Set(draft.workers.filter((worker) => worker.role === "INSTRUCTOR").map((worker) => worker.clientId));
  if (!draft.activities.every((activity) =>
    !Object.keys(activity).some((key) => !["clientId","sectorClientId","instructorClientId","name","iconKey","color","status","settlementMode","fixedClubFee","fixedFeeFrequency","currencyCode","clubSharePercentage"].includes(key))
    && typeof activity.name === "string" && Boolean(activity.name.trim())
    && isActivityIconKey(activity.iconKey)
    && typeof activity.color === "string" && /^#[0-9a-f]{6}$/i.test(activity.color)
    && typeof activity.sectorClientId === "string" && sectorIds.has(activity.sectorClientId)
    && (activity.instructorClientId === null || (typeof activity.instructorClientId === "string" && instructorIds.has(activity.instructorClientId)))
    && ["FIXED", "VARIABLE"].includes(String(activity.settlementMode))
    && (activity.settlementMode === "VARIABLE" ? activity.fixedClubFee === null && activity.fixedFeeFrequency === null && activity.currencyCode === null && finiteNonNegative(activity.clubSharePercentage) && activity.clubSharePercentage <= 100 : activity.clubSharePercentage === null && finiteNonNegative(activity.fixedClubFee) && ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(activity.fixedFeeFrequency)) && SUPPORTED_OPERATIONAL_CURRENCIES.includes(activity.currencyCode as never))
    && ["active", "inactive"].includes(String(activity.status)))) return false;

  return true;
};
