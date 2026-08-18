import { getPostgresPool } from "../db/postgres.js";
import type { AuthUser } from "./types.js";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  status: "active" | "disabled";
  failed_login_attempts: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  membership_id: string | null;
  club_id: string | null;
  role_code: string | null;
  permissions: string[] | null;
  sector_ids: string[] | null;
  person_id: string | null;
};

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  resolveTenant(userId: string): Promise<AuthUser["tenant"]>;
  recordFailedLogin(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(userId: string, loggedInAt: Date): Promise<void>;
}

export const getActiveMembershipContext = async (userId: string, membershipId: string) => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ membership_id: string; club_id: string; role: string; permissions: string[]; sector_ids: string[]; session_revoked_before: Date | null }>(
    `select ucm.id as membership_id, ucm.club_id, r.code as role,
            ucm.permissions, ucm.sector_ids, u.session_revoked_before
       from miclub.user_club_memberships ucm
       join miclub.users u on u.id=ucm.user_id and u.status='active'
       join miclub.clubs c on c.id=ucm.club_id and c.is_active=true
       join miclub.roles r on r.id=ucm.role_id and r.club_id=ucm.club_id
      where ucm.id=$1 and ucm.user_id=$2 and ucm.status='active'`,
    [membershipId, userId],
  );
  return result.rows[0] ?? null;
};

export const revokeUserSessions = async (userId: string, revokedAt = new Date()): Promise<void> => {
  const pool = await getPostgresPool();
  await pool.query(
    `update miclub.users set session_revoked_before=$2, updated_at=now() where id=$1`,
    [userId, revokedAt],
  );
};

export const listActiveMemberships = async (userId: string) => {
  const pool = await getPostgresPool();
  const result = await pool.query<{ membershipId: string; clubId: string; clubName: string; role: string }>(
    `select ucm.id as "membershipId", ucm.club_id as "clubId", c.name as "clubName", r.code as role
       from miclub.user_club_memberships ucm
       join miclub.clubs c on c.id=ucm.club_id and c.is_active=true
       join miclub.roles r on r.id=ucm.role_id and r.club_id=ucm.club_id
      where ucm.user_id=$1 and ucm.status='active' order by c.name, ucm.created_at`, [userId],
  );
  return result.rows;
};

const mapUser = (row: UserRow): AuthUser => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  status: row.status,
  failedLoginAttempts: row.failed_login_attempts,
  lockedUntil: row.locked_until,
  lastLoginAt: row.last_login_at,
  tenant: row.membership_id && row.club_id && row.role_code && row.person_id ? {
    personId: row.person_id,
    membershipId: row.membership_id,
    clubId: row.club_id,
    role: row.role_code,
    permissions: row.permissions ?? [],
    sectorIds: row.sector_ids ?? []
  } : null
});

export const postgresUserRepository: UserRepository = {
  async findByEmail(email) {
    const pool = await getPostgresPool();
    const result = await pool.query<UserRow>(
      `SELECT u.id, u.email, u.password_hash, u.status, u.failed_login_attempts,
              u.locked_until, u.last_login_at,
              NULL::uuid AS membership_id, NULL::uuid AS club_id,
              NULL::text AS role_code, NULL::text[] AS permissions,
              NULL::uuid[] AS sector_ids, NULL::uuid AS person_id
       FROM miclub.users u
       WHERE lower(u.email) = lower($1) LIMIT 1`,
      [email]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  },

  async resolveTenant(userId) {
    const pool = await getPostgresPool();
    // The function is the deliberately narrow authentication bootstrap across
    // FORCE RLS. It is called only after the application verified the password.
    const result = await pool.query<Pick<UserRow, "membership_id" | "club_id" | "role_code" | "permissions" | "sector_ids" | "person_id">>(
      `select membership_id, club_id, role_code, permissions, sector_ids, person_id
         from miclub.resolve_login_membership($1)`,
      [userId],
    );
    const row = result.rows[0];
    return row?.membership_id && row.club_id && row.role_code && row.person_id ? {
      personId: row.person_id, membershipId: row.membership_id, clubId: row.club_id,
      role: row.role_code, permissions: row.permissions ?? [], sectorIds: row.sector_ids ?? [],
    } : null;
  },

  async recordFailedLogin(userId, failedAttempts, lockedUntil) {
    const pool = await getPostgresPool();
    await pool.query(
      `UPDATE miclub.users
       SET failed_login_attempts = $2, locked_until = $3, updated_at = now()
       WHERE id = $1`,
      [userId, failedAttempts, lockedUntil]
    );
  },

  async recordSuccessfulLogin(userId, loggedInAt) {
    const pool = await getPostgresPool();
    await pool.query(
      `UPDATE miclub.users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = $2, updated_at = now()
       WHERE id = $1`,
      [userId, loggedInAt]
    );
  }
};
