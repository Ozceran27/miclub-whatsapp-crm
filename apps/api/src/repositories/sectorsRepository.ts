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
  status: "active" | "inactive" | "under_repair";
}>;

export type SectorCreate = { templateId: string; color: string; status: "active" | "inactive" | "under_repair" };

export type SectorMutationResult =
  | { kind: "updated"; sector: SectorRow }
  | { kind: "missing" | "conflict" | "protected" | "dependencies" | "invalid_manager"; dependencies?: Record<string, number> };

const sectorColumns = `id, club_id, manager_person_id, code, name, description, icon, color,
  capacity_mode, configured_capacity, status, is_system, archived_at, created_at, updated_at`;

export const isProtectedSector = (row: Record<string, unknown>): boolean => row.is_system === true;

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
    if (isProtectedSector(before) && [input.name, input.description, input.icon, input.managerPersonId, input.capacityMode, input.configuredCapacity].some((value) => value !== undefined)) return { kind: "protected" };

    if (input.managerPersonId) {
      const manager = await executor.query(`select id from miclub.people where club_id=$1 and id=$2`, [actor.clubId, input.managerPersonId]);
      if (!manager.rows[0]) return { kind: "invalid_manager" };
    }

    const fields: Array<[string, unknown]> = [
      ["name", input.name], ["description", input.description], ["icon", input.icon], ["color", input.color],
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
  return withTransaction(async (executor) => {
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
  return withTransaction(async (executor) => {
    const current = await executor.query<SectorRow>(`select ${sectorColumns} from miclub.sectors where club_id=$1 and id=$2 for update`, [actor.clubId, id]);
    const before = current.rows[0];
    if (!before) return { kind: "missing" };
    if (new Date(before.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString()) return { kind: "conflict" };
    if (isProtectedSector(before)) return { kind: "protected" };

    const result = await executor.query<SectorRow>(
      `update miclub.sectors set status='archived', archived_at=now(), updated_at=now(), updated_by=$3::uuid where club_id=$1 and id=$2 returning ${sectorColumns}`,
      [actor.clubId, id, actor.userId],
    );
    await auditMutation(actor, "sector.archive", before, result.rows[0], executor);
    return { kind: "updated", sector: result.rows[0] };
  }, pool);
};

export const listSectorTemplates = async (): Promise<Record<string, unknown>[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query(`select id, code, display_name, icon_key, display_order from miclub.sector_templates where active=true order by display_order, display_name`);
  return result.rows;
};

export const createSector = async (actor: SectorActor, input: SectorCreate): Promise<{ kind: "created"; sector: SectorRow } | { kind: "invalid_template" } | { kind: "duplicate" }> => {
  const pool = await getPostgresPool();
  return withTransaction(async (executor) => {
    const template = await executor.query<{ id: string; code: string; display_name: string; icon_key: string }>(
      `select id, code, display_name, icon_key from miclub.sector_templates where id=$1 and active=true`, [input.templateId],
    );
    const item = template.rows[0];
    if (!item) return { kind: "invalid_template" };
    const duplicate = await executor.query(`select 1 from miclub.sectors where club_id=$1 and template_id=$2 and archived_at is null`, [actor.clubId, item.id]);
    if (duplicate.rows[0]) return { kind: "duplicate" };
    const inserted = await executor.query<SectorRow>(`insert into miclub.sectors
      (club_id, template_id, code, name, icon, color, status, is_system, created_by, updated_by)
      values ($1,$2,$3,$4,$5,$6,$7,false,$8::uuid,$8::uuid) returning ${sectorColumns}`,
    [actor.clubId, item.id, item.code, item.display_name, item.icon_key, input.color, input.status, actor.userId]);
    return { kind: "created", sector: inserted.rows[0] };
  }, pool);
};
