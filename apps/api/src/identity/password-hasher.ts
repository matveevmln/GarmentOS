import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Окончательное решение (docs/AUTH_ARCHITECTURE.md, раздел 3) — не
// заглушка. Домен намеренно не знает алгоритм хеширования
// (packages/domain/identity/src/domain/user.ts, PRINCIPLES.md принцип 4).
// scrypt из node:crypto выбран вместо argon2 осознанно: встроен в Node без
// нативной компиляции (node-gyp), одинаково работает на любой cloud-agnostic
// площадке (docs/INFRASTRUCTURE.md) — принцип 5 «скучные технологии».
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, key] = passwordHash.split(":");
  if (!salt || !key) return false;

  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  const keyBuffer = Buffer.from(key, "hex");
  return keyBuffer.length === derivedKey.length && timingSafeEqual(keyBuffer, derivedKey);
}
