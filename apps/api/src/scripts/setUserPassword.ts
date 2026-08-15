import { closePostgresAdminPool, getPostgresAdminPool } from "../db/postgres.js";
import { hashPassword } from "../auth/passwordHasher.js";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1]?.trim().toLowerCase() : "";
const password = process.env.AUTH_NEW_PASSWORD ?? "";

if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Uso: npm run auth:set-password -- --email usuario@dominio");
if (password.length < 12) throw new Error("AUTH_NEW_PASSWORD debe contener al menos 12 caracteres.");

try {
  const pool = await getPostgresAdminPool();
  const passwordHash = await hashPassword(password);
  const result = await pool.query<{ id: string }>(
    `update miclub.users set password_hash=$2 where lower(email)=lower($1) returning id`,
    [email, passwordHash],
  );
  if (result.rows.length !== 1) throw new Error(`Se esperaba actualizar exactamente un usuario; encontrados: ${result.rows.length}.`);
  console.log("Password hash actualizado para una única identidad.");
} finally {
  await closePostgresAdminPool();
}
