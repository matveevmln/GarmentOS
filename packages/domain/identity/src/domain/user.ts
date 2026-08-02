import { DomainError } from "./errors";

// Пользователь компании. Полная модель ролей/прав (RBAC) — Итерация 5
// (docs/ROADMAP.md); здесь — минимум, нужный остальным модулям для
// атрибуции (createdBy) и для сценариев Inbox (кто подтвердил предложение).
export interface User {
  id: string;
  companyId: string;
  email: string;
  passwordHash: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertValidEmail(email: string): void {
  if (!EMAIL_RE.test(email)) {
    throw new DomainError(`Некорректный email: "${email}"`, "USER_EMAIL_INVALID");
  }
}

export function assertValidFullName(fullName: string): void {
  if (fullName.trim().length === 0) {
    throw new DomainError("Имя пользователя не может быть пустым", "USER_FULL_NAME_REQUIRED");
  }
}

export function assertValidPasswordHash(passwordHash: string): void {
  // Домен не знает, каким алгоритмом хешируют пароль (Infrastructure/Auth,
  // Итерация 5, PRINCIPLES.md принцип 4) — только что хеш обязателен и это
  // не сам пароль в открытом виде, случайно переданный по ошибке вызывающим кодом.
  if (passwordHash.trim().length === 0) {
    throw new DomainError("Хеш пароля обязателен", "USER_PASSWORD_HASH_REQUIRED");
  }
}
