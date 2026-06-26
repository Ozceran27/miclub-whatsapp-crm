import { getPostgresPool } from "../db/postgres.js";

export type PersonRow = Record<string, unknown>;

export type PeopleQuery = {
  limit: number;
  offset: number;
  search?: string;
};

export type PeoplePage = {
  rows: PersonRow[];
  total: number;
};

const buildPeopleWhereClause = (search: string | undefined): { sql: string; params: unknown[] } => {
  const normalizedSearch = search?.trim();
  if (!normalizedSearch) return { sql: "", params: [] };

  return { sql: "where row_to_json(people)::text ilike $1", params: [`%${normalizedSearch}%`] };
};

export const getPeople = async ({ limit, offset, search }: PeopleQuery): Promise<PeoplePage> => {
  const pool = await getPostgresPool();
  const where = buildPeopleWhereClause(search);
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
