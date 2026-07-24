import { DomainError } from "./errors";

export type WorkshopStatus = "draft" | "active" | "archived";

// Швейный цех-подрядчик — независимая компания, выполняющая пошив по нашему
// заказу, НЕ наш сотрудник и не наш цех (docs/DATABASE_SCHEMA.md, раздел 8;
// CLAUDE.md, глоссарий).
export interface Workshop {
  id: string;
  companyId: string;
  name: string;
  inn: string | null;
  contactInfo: string | null;
  specialization: string | null;
  status: WorkshopStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function assertValidWorkshopName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название цеха не может быть пустым", "WORKSHOP_NAME_REQUIRED");
  }
}
