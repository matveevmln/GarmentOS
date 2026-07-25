import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Плейсхолдер хеширования до полноценного Auth в Итерации 5 (RBAC, JWT) —
// см. packages/domain/identity/src/domain/user.ts: домен намеренно не знает
// алгоритм хеширования, это решает Infrastructure-слой (PRINCIPLES.md,
// принцип 4). scrypt из node:crypto — встроенный в Node, без новой
// зависимости (PRINCIPLES.md, принцип 5 «скучные технологии»); окончательный
// выбор алгоритма (возможно, argon2) — осознанное решение Итерации 5, не
// сейчас, чтобы не фиксировать формат хеша раньше, чем появится реальный
// login/JWT-флоу, который будет его использовать.
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
