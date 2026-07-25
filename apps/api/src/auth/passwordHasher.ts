import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const keyLength = 64;

export const hashPassword = async (password: string): Promise<string> => {
  if (!password) throw new Error("La contraseña no puede estar vacía.");
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [algorithm, encodedSalt, encodedHash, extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedHash || extra !== undefined) return false;

  try {
    const expected = Buffer.from(encodedHash, "base64url");
    if (expected.length !== keyLength) return false;
    const actual = (await scrypt(password, Buffer.from(encodedSalt, "base64url"), expected.length)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};
