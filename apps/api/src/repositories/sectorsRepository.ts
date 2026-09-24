import { getPostgresPool } from "../db/postgres.js";
import { withTenantTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";
import { normalizeComparableText } from "../importers/normalizers.js";

export type SectorRow = Record<string, unknown> & { id: string; updated_at: Date | string };

export type SectorActor = {
  userId: string;
  membershipId: string;
  clubId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export type SectorUpdate = Partial<{
  name: string;
  description: string | null;
  iconKey: string;
  color: string;
  managerPersonId: string | null;
  capacityMode: "ENROLLMENTS" | "INCOME";
  configuredCapacity: number | null;
  status: "active" | "inactive" | "under_repair";
}>;

export type SectorCreate = { name: string; code?: string | null; description?: string | null; iconKey: string; color: string; managerPersonId: string | null; status: "active" | "inactive" | "under_repair"; capacityMode: "ENROLLMENTS" | "INCOME"; configuredCapacity: number | null };

export type SectorMutationResult =
  | { kind: "updated"; sector: SectorRow }
  | { kind: "missing" | "conflict" | "protected" | "dependencies" | "invalid_manager"; dependencies?: Record<string, number> };

const sectorColumns = `id, club_id, manager_person_id, code, name, description, icon, icon_key, color,
  capacity_mode, configured_capacity, status, is_system, archived_at, created_at, updated_at`;

export const isProtectedSector = (row: Record<string, unknown>): boolean => row.is_system === true;

const eligibleManagerSql = `select p.id from miclub.people p where p.club_id=$1 and p.id=$2 and (
  exists(select 1 from miclub.employees e where e.club_id=p.club_id and e.person_id=p.id and e.status='active' and e.archived_at is null)
  or exists(select 1 from miclub.instructors i where i.club_id=p.club_id and i.person_id=p.id and i.status='activa')
)`;

const managerIsEligible = async (executor: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, clubId: string, personId: string) =>
  Boolean((await executor.query(eligibleManagerSql, [clubId, personId])).rows[0]);

export const listSectorManagerCandidates = async (clubId: string): Promise<Array<{ personId: string; displayName: string }>> => {
  const pool = await getPostgresPool();
  return withTenantTransaction(clubId, async (executor) => {
    const result = await executor.query<{ personId: string; displayName: string }>(`select p.id::text "personId", trim(concat_ws(' ',p.first_name,p.last_name)) "displayName"
      from miclub.people p where p.club_id=$1 and (
        exists(select 1 from miclub.employees e where e.club_id=p.club_id and e.person_id=p.id and e.status='active' and e.archived_at is null)
        or exists(select 1 from miclub.instructors i where i.club_id=p.club_id and i.person_id=p.id and i.status='activa')
      ) order by p.last_name,p.first_name,p.id`, [clubId]);
    return result.rows;
  }, pool);
};

const auditMutation = async (actor: SectorActor, action: string, before: SectorRow, after: SectorRow, executor: Parameters<typeof auditService.sensitiveChange>[1]) => {
  await auditService.sensitiveChange({
    action,
    result: "success",
    userId: actor.userId,
    membershipId: actor.membershipId,
    clubId: actor.clubId,
    entityType: "sector",
    entityId: before.id,
    requestId: actor.requestId,
    ip: actor.ip,
    userAgent: actor.userAgent,
    oldData: before,
    newData: after,
  }, executor);
};

export const updateSector = async (actor: SectorActor, id: string, expectedUpdatedAt: string, input: SectorUpdate): Promise<SectorMutationResult> => {
  const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (isProtectedSector(before)) return { kind: "protected" };

    if (input.managerPersonId) {
      if (!await managerIsEligible(executor, actor.clubId, input.managerPersonId)) return { kind: "invalid_manager" };
    }

    const fields: Array<[string, unknown]> = [
      ["name", input.name], ["description", input.description], ["icon", input.iconKey], ["icon_key", input.iconKey], ["color", input.color],
      ["manager_person_id", input.managerPersonId], ["capacity_mode", input.capacityMode], ["configured_capacity", input.configuredCapacity],
      ["status", input.status],
    ].filter((entry) => entry[1] !== undefined) as Array<[string, unknown]>;
    const values = fields.map((entry) => entry[1]);
    const assignments = fields.map(([column], index) => `${column}=$${index + 4}`);
    const result = await executor.query<SectorRow>(
      `update miclub.sectors set ${assignments.join(", ")}, updated_at=now(), updated_by=$3::uuid where club_id=$1 and id=$2 returning ${sectorColumns}`,
      [actor.clubId, id, actor.userId, ...values],
    );
    const after = result.rows[0];
    await auditMutation(actor, "sector.update", before, after, executor);
    return { kind: "updated", sector: after };
  }, pool);
};

export const setSectorStatus = async (actor: SectorActor, id: string, expectedUpdatedAt: string, status: "active" | "inactive" | "under_repair"): Promise<SectorMutationResult> => {
  const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    const result = await executor.query<SectorRow>(
      `update miclub.sectors set status=$3, updated_at=now(), updated_by=$4::uuid where club_id=$1 and id=$2 and archived_at is null returning ${sectorColumns}`,
      [actor.clubId, id, status, actor.userId],
    );
    if (!result.rows[0]) return { kind: "conflict" };
    await auditMutation(actor, "sector.status", before, result.rows[0], executor);
    return { kind: "updated", sector: result.rows[0] };
  }, pool);
};

export const archiveSector = async (actor: SectorActor, id: string, expectedUpdatedAt: string): Promise<SectorMutationResult> => {
  const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (isProtectedSector(before)) return { kind: "protected" };

    const dependencies = (await executor.query<{ activities: number; workers: number }>(`
      select
        (select count(*)::int from miclub.activities where club_id=$1 and sector_id=$2 and archived_at is null) activities,
        (select count(*)::int from miclub.employees where club_id=$1 and sector_id=$2 and archived_at is null and status='active') workers`,
    [actor.clubId, id])).rows[0];
    if ((dependencies?.activities ?? 0) > 0 || (dependencies?.workers ?? 0) > 0) return { kind: "dependencies", dependencies };

    const result = await executor.query<SectorRow>(
      `update miclub.sectors set status='archived', archived_at=now(), updated_at=now(), updated_by=$3::uuid where club_id=$1 and id=$2 returning ${sectorColumns}`,
      [actor.clubId, id, actor.userId],
    );
    await auditMutation(actor, "sector.archive", before, result.rows[0], executor);
    return { kind: "updated", sector: result.rows[0] };
  }, pool);
};

const normalizeCode = (value: string): string => normalizeComparableText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "SECTOR";

export const createSector = async (actor: SectorActor, input: SectorCreate): Promise<{ kind: "created"; sector: SectorRow } | { kind: "invalid_manager" }> => {
  const pool = await getPostgresPool();
  return withTenantTransaction(actor.clubId, async (executor) => {
    if (input.managerPersonId && !await managerIsEligible(executor, actor.clubId, input.managerPersonId)) return { kind: "invalid_manager" };
    const baseCode = normalizeCode(input.code || input.name);
    await executor.query(`select pg_advisory_xact_lock(hashtextextended($1,19001))`,[`${actor.clubId}:${baseCode}`]);
    const existing = await executor.query<{ code: string }>(`select code from miclub.sectors where club_id=$1 and lower(code) like lower($2)`, [actor.clubId, `${baseCode}%`]);
    const used = new Set(existing.rows.map((row) => row.code.toUpperCase()));
    let code = baseCode;
    for (let suffix = 2; used.has(code); suffix += 1) code = `${baseCode.slice(0, 55)}_${suffix}`;
    const inserted = await executor.query<SectorRow>(`insert into miclub.sectors
      (club_id, code, name, description, icon, icon_key, color, manager_person_id, capacity_mode, configured_capacity, status, is_system, created_by, updated_by)
      values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,false,$11::uuid,$11::uuid) returning ${sectorColumns}`,
    [actor.clubId, code, input.name.trim(), input.description ?? null, input.iconKey, input.color, input.managerPersonId, input.capacityMode, input.configuredCapacity, input.status, actor.userId]);
    return { kind: "created", sector: inserted.rows[0] };
  }, pool);
};
