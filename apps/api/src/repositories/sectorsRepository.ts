import { getPostgresPool } from "../db/postgres.js";
import { withTransaction } from "../db/transaction.js";
import { auditService } from "../services/auditService.js";

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
  icon: string | null;
  color: string;
  managerPersonId: string | null;
  capacityMode: "none" | "fixed" | "unlimited";
  configuredCapacity: number | null;
}>;

export type SectorMutationResult =
  | { kind: "updated"; sector: SectorRow }
  | { kind: "missing" | "conflict" | "protected" | "dependencies" | "invalid_manager"; dependencies?: Record<string, number> };

const sectorColumns = `id, club_id, manager_person_id, code, name, description, icon, color,
  capacity_mode, configured_capacity, status, is_system, archived_at, created_at, updated_at`;

const normalizeSectorIdentity = (value: unknown): string => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

const isProtectedSector = (row: Record<string, unknown>): boolean => row.is_system === true
  || [row.name, row.code].some((value) => ["OTROS", "TESORERIA", "ADMINISTRACION"].includes(normalizeSectorIdentity(value)));

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
  return withTransaction(async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (isProtectedSector(before)) return { kind: "protected" };

    if (input.managerPersonId) {
      const manager = await executor.query(`select id from miclub.people where club_id=$1 and id=$2`, [actor.clubId, input.managerPersonId]);
      if (!manager.rows[0]) return { kind: "invalid_manager" };
    }

    const fields: Array<[string, unknown]> = [
      ["name", input.name], ["description", input.description], ["icon", input.icon], ["color", input.color],
      ["manager_person_id", input.managerPersonId], ["capacity_mode", input.capacityMode], ["configured_capacity", input.configuredCapacity],
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

export const setSectorStatus = async (actor: SectorActor, id: string, expectedUpdatedAt: string, status: "active" | "inactive"): Promise<SectorMutationResult> => {
  const pool = await getPostgresPool();
  return withTransaction(async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (isProtectedSector(before)) return { kind: "protected" };
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
  return withTransaction(async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (isProtectedSector(before)) return { kind: "protected" };

    const dependencyResult = await executor.query<{ activities: number; movements: number; memberships: number }>(`
      select
        (select count(*)::integer from miclub.activities where club_id=$1 and sector_id=$2 and archived_at is null) activities,
        (select count(*)::integer from miclub.movements where club_id=$1 and sector_id=$2) movements,
        (select count(*)::integer from miclub.user_club_memberships where club_id=$1 and $2::uuid = any(coalesce(sector_ids, '{}'::uuid[]))) memberships
    `, [actor.clubId, id]);
    const dependencies = dependencyResult.rows[0] ?? { activities: 0, movements: 0, memberships: 0 };
    if (Object.values(dependencies).some((count) => Number(count) > 0)) return { kind: "dependencies", dependencies };

    const result = await executor.query<SectorRow>(
      `update miclub.sectors set status='archived', archived_at=now(), updated_at=now(), updated_by=$3::uuid where club_id=$1 and id=$2 returning ${sectorColumns}`,
      [actor.clubId, id, actor.userId],
    );
    await auditMutation(actor, "sector.archive", before, result.rows[0], executor);
    return { kind: "updated", sector: result.rows[0] };
  }, pool);
};
