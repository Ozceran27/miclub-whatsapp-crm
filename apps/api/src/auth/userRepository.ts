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
};

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  recordFailedLogin(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(userId: string, loggedInAt: Date): Promise<void>;
}

const mapUser = (row: UserRow): AuthUser => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  status: row.status,
  failedLoginAttempts: row.failed_login_attempts,
  lockedUntil: row.locked_until,
  lastLoginAt: row.last_login_at,
  tenant: row.membership_id && row.club_id && row.role_code ? {
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
              u.locked_until, u.last_login_at, membership.id AS membership_id,
              membership.club_id, membership.role_code, membership.permissions,
              membership.sector_ids
       FROM miclub.users u
       LEFT JOIN LATERAL (
         SELECT ucm.id, ucm.club_id, r.code AS role_code,
                ucm.permissions, ucm.sector_ids
         FROM miclub.user_club_memberships ucm
         JOIN miclub.roles r ON r.id = ucm.role_id AND r.club_id = ucm.club_id
         WHERE ucm.user_id = u.id AND ucm.status = 'active'
         ORDER BY ucm.created_at ASC
         LIMIT 1
       ) membership ON true
       WHERE lower(u.email) = lower($1) LIMIT 1`,
      [email]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
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
