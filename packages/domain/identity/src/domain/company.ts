import { DomainError } from "./errors";

// Компания — корень мультитенантности (docs/DATABASE_SCHEMA.md, раздел 1).
export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  timezone: string;
  defaultCurrency: string;
  // Кто подписывает спецификации со стороны компании (Заказчик) — ФИО;
  // nullable, пока не задано в настройках компании (Document Template Engine).
  signerName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidCompanyName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название компании не может быть пустым", "COMPANY_NAME_REQUIRED");
  }
}
