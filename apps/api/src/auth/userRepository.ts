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
  lastLoginAt: row.last_login_at
});

export const postgresUserRepository: UserRepository = {
  async findByEmail(email) {
    const pool = await getPostgresPool();
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, status, failed_login_attempts, locked_until, last_login_at
       FROM miclub.users WHERE email = $1 LIMIT 1`,
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
