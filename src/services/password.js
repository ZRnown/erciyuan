import { createHash } from "node:crypto";

export function hashPassword(password, salt) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export function verifyPassword(password, salt, expectedHash) {
  return hashPassword(password, salt) === expectedHash;
}
