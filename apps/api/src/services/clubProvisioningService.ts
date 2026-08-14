import { CLUB_ROLE_DEFINITIONS, type ClubRegistrationDto } from "@miclub/shared";

export interface TransactionClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export type ProvisionedClub = Readonly<{
  clubId: string;
  userId: string;
  personId: string;
  membershipId: string;
}>;

const clubCode = (name: string): string => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "club";

/** Creates all records required for a usable tenant. The caller owns the transaction. */
export async function provisionClub(
  client: TransactionClient,
  input: Omit<ClubRegistrationDto, "password">,
  passwordHash: string,
): Promise<ProvisionedClub> {
  const club = await client.query<{ id: string }>(`
    insert into miclub.clubs (code, name, timezone, settings)
    values ($1 || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), $2,
      'America/Argentina/Buenos_Aires',
      '{"configuration":{}}'::jsonb)
    returning id`, [clubCode(input.club.name), input.club.name]);
  const clubId = club.rows[0].id;

  await client.query(`
    insert into miclub.club_onboarding (club_id, status, current_step, completed_steps, skipped_steps)
    values ($1, 'NOT_STARTED', 1, '{}'::smallint[], '{}'::smallint[])`, [clubId]);

  const roleRows = Object.entries(CLUB_ROLE_DEFINITIONS);
  const roles = await client.query<{ id: string; code: keyof typeof CLUB_ROLE_DEFINITIONS }>(`
    insert into miclub.roles (club_id, code, name, description)
    select $1, definition.code, definition.name, definition.description
    from jsonb_to_recordset($2::jsonb) as definition(code text, name text, description text)
    returning id, code`, [clubId, JSON.stringify(roleRows.map(([code, definition]) => ({ code, name: definition.name, description: definition.description })))]);
  const directorRole = roles.rows.find(({ code }) => code === "DIRECTOR");
  if (!directorRole) throw new Error("No se pudo aprovisionar el rol DIRECTOR.");
  const user = await client.query<{ id: string }>(`
    insert into miclub.users (email, password_hash, display_name, status, is_active)
    values ($1, $2, $3, 'active', true) returning id`,
  [input.email, passwordHash, `${input.firstName} ${input.lastName}`]);
  const person = await client.query<{ id: string }>(`
    insert into miclub.people (club_id, user_id, first_name, last_name, dni, phone, email, status)
    values ($1, $2, $3, $4, $5, $6, $7, 'activa') returning id`,
  [clubId, user.rows[0].id, input.firstName, input.lastName, input.dni, input.phone, input.email]);
  const membership = await client.query<{ id: string }>(`
    insert into miclub.user_club_memberships (user_id, club_id, role_id, status, permissions)
    values ($1, $2, $3, 'active', $4::text[]) returning id`,
  [user.rows[0].id, clubId, directorRole.id, [...CLUB_ROLE_DEFINITIONS.DIRECTOR.permissions]]);

  await client.query(`
    insert into miclub.employees (club_id, person_id, user_id, membership_id, status, position, employment_start_date)
    values ($1, $2, $3, $4, 'active', 'Director', current_date)`,
  [clubId, person.rows[0].id, user.rows[0].id, membership.rows[0].id]);
  await client.query(`
    insert into miclub.sectors (club_id, code, name, is_system, status, uses_activities)
    values ($1, 'administracion', 'Administración', true, 'active', false),
           ($1, 'tesoreria', 'Tesorería', true, 'active', false),
           ($1, 'areas-comunes', 'Áreas Comunes', true, 'active', false)` , [clubId]);
  await client.query(`insert into miclub.payment_methods (club_id, name) values ($1, 'Efectivo'), ($1, 'Transferencia') on conflict do nothing`, [clubId]);

  return { clubId, userId: user.rows[0].id, personId: person.rows[0].id, membershipId: membership.rows[0].id };
}
