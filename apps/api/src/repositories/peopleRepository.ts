import { getPostgresPool } from "../db/postgres.js";

export type PersonRow = Record<string, unknown>;

export type PeopleQuery = {
  clubId: string;
  limit: number;
  offset: number;
  search?: string;
};

export type PeoplePage = {
  rows: PersonRow[];
  total: number;
};

const buildPeopleWhereClause = (clubId: string, search: string | undefined): { sql: string; params: unknown[] } => {
  const normalizedSearch = search?.trim();
  if (!normalizedSearch) return { sql: "where people.club_id = $1", params: [clubId] };

  return { sql: "where people.club_id = $1 and row_to_json(people)::text ilike $2", params: [clubId, `%${normalizedSearch}%`] };
};

export const getPeople = async ({ clubId, limit, offset, search }: PeopleQuery): Promise<PeoplePage> => {
  const pool = await getPostgresPool();
  const where = buildPeopleWhereClause(clubId, search);
  const limitParam = where.params.length + 1;
  const offsetParam = where.params.length + 2;

  const result = await pool.query<PersonRow & { total_count: string | number }>(
    `
      select *, count(*) over() as total_count
      from miclub.people as people
      ${where.sql}
      order by id asc
      limit $${limitParam}
      offset $${offsetParam}
    `,
    [...where.params, limit, offset]
  );

  const rows = result.rows.map(({ total_count: _totalCount, ...row }) => row);
  const totalCount = result.rows[0]?.total_count;
  const total = typeof totalCount === "number" ? totalCount : Number(totalCount ?? 0);

  return { rows, total };
};
