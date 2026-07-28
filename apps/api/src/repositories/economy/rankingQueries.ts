import { getPostgresPool } from "../../db/postgres.js";
import { getArgentinaCalendarYear } from "../../domain/argentinaTime.js";
import { DEBT_LIABILITY_CATEGORY_KEYS, NON_OPERATING_EXPENSE_CATEGORY_KEYS, OPERATING_CATEGORIES, SERVICE_CATEGORY_KEYS, TAX_CATEGORY_KEYS } from "../../services/economyDomain.js";
import { completedMovementPredicate, pendingMovementPredicate } from "../movementPredicates.js";
import type { EconomyRow } from "./types.js";

const rankingQuery = (dimensionSql: string, idSql: string, tableSql: string) => `
  select ${idSql} as id,
         coalesce(${dimensionSql}, 'Sin clasificar') as name,
         coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'INGRESOS'), 0) as income,
         coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'EGRESOS'), 0) as expenses,
         coalesce(sum(case when m.movement_type = 'INGRESOS' then abs(m.amount) when m.movement_type = 'EGRESOS' then -abs(m.amount) else 0 end), 0) as balance,
         count(m.id)::integer as movements
  from miclub.movements m
  ${tableSql}
  left join miclub.movement_categories ranking_category on ranking_category.id = m.category_id and ranking_category.club_id = m.club_id
  where m.movement_date >= $1::timestamptz and m.movement_date < $2::timestamptz
    and m.club_id = $5
    and ${completedMovementPredicate("m")}
    and upper(regexp_replace(regexp_replace(translate(trim(coalesce(ranking_category.name, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\\s+', ' ', 'g'), '\\.+$', '', 'g')) = any($4::text[])
    and m.movement_type in ('INGRESOS', 'EGRESOS')
  group by ${idSql}, ${dimensionSql}
  order by balance desc, income desc
  limit $3::integer
`;

export const getRankingBySector = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("s.name", "s.id", "left join miclub.sectors s on s.id = m.sector_id and s.club_id = m.club_id"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

export const getRankingByCategory = async (from: Date, to: Date, limit: number, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  return (await pool.query<EconomyRow>(rankingQuery("c.name", "c.id", "left join miclub.movement_categories c on c.id = m.category_id and c.club_id = m.club_id"), [from, to, limit, OPERATING_CATEGORIES, clubId])).rows;
};

export const getPaymentMethods = async (from: Date, to: Date, clubId: string): Promise<EconomyRow[]> => {
  const pool = await getPostgresPool();
  const result = await pool.query<EconomyRow>(`
    select pm.id, coalesce(pm.name, 'Sin método') as name,
           coalesce(sum(abs(m.amount)) filter (where m.movement_type = 'INGRESOS'), 0) as amount,
           count(m.id) filter (where m.movement_type = 'INGRESOS')::integer as movements
    from miclub.movements m
    left join miclub.payment_methods pm on pm.id = m.payment_method_id and pm.club_id = m.club_id
    where m.operational_status = 'COMPLETADO'
      and m.movement_type = 'INGRESOS'
      and m.movement_date >= $1::timestamptz and m.movement_date < $2::timestamptz
      and m.club_id = $3
    group by pm.id, pm.name
    order by amount desc
  `, [from, to, clubId]);
  return result.rows;
};

