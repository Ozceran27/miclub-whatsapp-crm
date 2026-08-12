import type { ClubRegistrationDto } from "@miclub/shared";
import { getPostgresPool } from "../db/postgres.js";
import { provisionClub } from "../services/clubProvisioningService.js";
import { hashPassword } from "./passwordHasher.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_PATTERN = /^\d{7,9}$/;

export class RegistrationError extends Error {
  constructor(public readonly code: "invalid_input" | "email_exists" | "dni_exists", message: string) { super(message); }
}

export const validateRegistration = (body: unknown): ClubRegistrationDto => {
  const value = (typeof body === "object" && body !== null ? body : {}) as Partial<ClubRegistrationDto>;
  const club = (typeof value.club === "object" && value.club !== null ? value.club : {}) as { name?: unknown };
  const clean = (candidate: unknown) => typeof candidate === "string" ? candidate.trim().replace(/\s+/g, " ") : "";
  const firstName = clean(value.firstName); const lastName = clean(value.lastName);
  const dni = clean(value.dni).replace(/[^0-9]/g, ""); const phone = clean(value.phone);
  const email = clean(value.email).toLowerCase(); const password = typeof value.password === "string" ? value.password : "";
  const clubName = clean(club.name);
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new RegistrationError("invalid_input", "Nombre y apellido son obligatorios.");
  if (!DNI_PATTERN.test(dni)) throw new RegistrationError("invalid_input", "El DNI no es válido.");
  if (phone.length < 6 || phone.length > 30) throw new RegistrationError("invalid_input", "El teléfono no es válido.");
  if (clubName.length < 2 || clubName.length > 120) throw new RegistrationError("invalid_input", "El nombre del club debe tener entre 2 y 120 caracteres.");
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new RegistrationError("invalid_input", "El correo electrónico no es válido.");
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new RegistrationError("invalid_input", "La contraseña debe tener entre 10 y 128 caracteres e incluir letras y números.");
  return { firstName, lastName, dni, phone, email, password, club: { name: clubName } };
};

const constraintName = (error: unknown): string => typeof error === "object" && error !== null && "constraint" in error ? String(error.constraint) : "";
const postgresCode = (error: unknown): string => typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

export const registerClub = async (body: unknown): Promise<void> => {
  const input = validateRegistration(body);
  const passwordHash = await hashPassword(input.password);
  const pool = await getPostgresPool(); const client = await pool.connect();
  try {
    await client.query("begin");
    const provisioningInput = { firstName: input.firstName, lastName: input.lastName, dni: input.dni, phone: input.phone, email: input.email, club: input.club };
    await provisionClub(client, provisioningInput, passwordHash);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof RegistrationError) throw error;
    if (postgresCode(error) === "23505") {
      const constraint = constraintName(error).toLowerCase();
      if (constraint.includes("email") || constraint.includes("app_users")) throw new RegistrationError("email_exists", "Ya existe una cuenta con ese correo electrónico.");
      if (constraint.includes("dni")) throw new RegistrationError("dni_exists", "Ya existe una persona con ese DNI.");
    }
    throw error;
  } finally { client.release(); }
};
