import { hashPassword } from "./passwordHasher.js";
import { getPostgresPool } from "../db/postgres.js";
import type { AuthenticatedContext } from "./types.js";
import { ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class RegistrationError extends Error {
  constructor(public readonly code: "invalid_input" | "email_exists", message: string) { super(message); }
}

const clubCode = (name: string): string => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "club";

export const validateRegistration = (clubName: unknown, email: unknown, password: unknown) => {
  const cleanClubName = typeof clubName === "string" ? clubName.trim().replace(/\s+/g, " ") : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanPassword = typeof password === "string" ? password : "";
  if (cleanClubName.length < 2 || cleanClubName.length > 120) throw new RegistrationError("invalid_input", "El nombre del club debe tener entre 2 y 120 caracteres.");
  if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) throw new RegistrationError("invalid_input", "El correo electrónico no es válido.");
  if (cleanPassword.length < 10 || cleanPassword.length > 128 || !/[A-Za-z]/.test(cleanPassword) || !/\d/.test(cleanPassword)) throw new RegistrationError("invalid_input", "La contraseña debe tener entre 10 y 128 caracteres e incluir letras y números.");
  return { clubName: cleanClubName, email: cleanEmail, password: cleanPassword };
};

export const registerClubOwner = async (clubName: unknown, email: unknown, password: unknown): Promise<AuthenticatedContext> => {
  const input = validateRegistration(clubName, email, password);
  const passwordHash = await hashPassword(input.password);
  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query("select 1 from miclub.users where email = $1 limit 1", [input.email]);
    if (existing.rows.length) throw new RegistrationError("email_exists", "Ya existe una cuenta con ese correo electrónico.");
    const club = await client.query<{ id: string }>(`insert into miclub.clubs (code, name, timezone, settings) values ($1 || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), $2, 'America/Argentina/Buenos_Aires', '{"onboarding":"pending"}'::jsonb) returning id`, [clubCode(input.clubName), input.clubName]);
    const clubId = club.rows[0].id;
    const role = await client.query<{ id: string }>(`insert into miclub.roles (club_id, code, name, description) values ($1, 'owner', 'Propietario', 'Control total del club') returning id`, [clubId]);
    const user = await client.query<{ id: string }>(`insert into miclub.users (email, password_hash, display_name, status, is_active) values ($1, $2, $3, 'active', true) returning id`, [input.email, passwordHash, input.clubName]);
    const person = await client.query<{ id: string }>(`insert into miclub.people (club_id, user_id, first_name, last_name, email, status) values ($1, $2, 'Administrador', $3, $4, 'activa') returning id`, [clubId, user.rows[0].id, input.clubName, input.email]);
    const ownerPermissions = [...ROLE_DEFAULT_PERMISSIONS.owner];
    const membership = await client.query<{ id: string }>(`insert into miclub.user_club_memberships (user_id, club_id, role_id, permissions) values ($1, $2, $3, $4::text[]) returning id`, [user.rows[0].id, clubId, role.rows[0].id, ownerPermissions]);
    await client.query(`insert into miclub.payment_methods (club_id, name) values ($1, 'Efectivo'), ($1, 'Transferencia') on conflict do nothing`, [clubId]);
    await client.query("commit");
    return { userId: user.rows[0].id, personId: person.rows[0].id, email: input.email, legacy: false, clubId, membershipId: membership.rows[0].id, role: "owner", permissions: ownerPermissions, sectorIds: [] };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof RegistrationError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "23505") throw new RegistrationError("email_exists", "Ya existe una cuenta con ese correo electrónico.");
    throw error;
  } finally { client.release(); }
};
