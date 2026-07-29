import { getPostgresPool, closePostgresPool } from "../db/postgres.js";

type AuditRow = Record<string, unknown>;

const sql = `
select
  m.club_id, m.external_id, m.movement_date, m.concept,
  m.movement_type as app_type, c.name as app_category,
  m.operational_status as app_status, m.amount as app_amount,
  s.name as app_sector,
  m.source_payload->'row'->>1 as sheet_date,
  m.source_payload->'row'->>3 as sheet_type,
  m.source_payload->'row'->>6 as sheet_category,
  m.source_payload->'row'->>9 as sheet_concept,
  m.source_payload->'row'->>17 as sheet_sector,
  m.source_payload->'row'->>19 as sheet_amount,
  m.source_payload->'row'->>24 as sheet_status
from miclub.movements m
left join miclub.movement_categories c on c.id=m.category_id and c.club_id=m.club_id
left join miclub.sectors s on s.id=m.sector_id and s.club_id=m.club_id
where m.club_id=$1 and m.source='google_sheets'
order by m.movement_date, m.external_id`;

export const auditEconomyMovements = async (clubId: string): Promise<AuditRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<AuditRow>(sql, [clubId])).rows;
};

if (process.argv[1]?.endsWith("auditEconomyMovements.ts")) {
  const clubId = process.argv[2];
  if (!clubId) throw new Error("Uso: auditEconomyMovements.ts <club_id>");
  auditEconomyMovements(clubId)
    .then((rows) => process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`))
    .finally(closePostgresPool);
}
