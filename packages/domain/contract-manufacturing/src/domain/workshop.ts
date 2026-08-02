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
  // Заполняется только после того, как цех перешёл по инвайт-ссылке в
  // Telegram (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md) — Bot API не
  // позволяет проактивно написать в чат, который не взаимодействовал с ботом.
  telegramChatId: string | null;
  // Рамочный договор с этим цехом — спецификации нумеруются как приложения
  // к нему (эталон 2026-07-26: "Спецификация №N к договору №X от Y г.").
  // nullable, пока договор не заведён — не изобретается.
  contractNumber: string | null;
  contractDate: string | null;
  nextSpecificationNumber: number;
  // Постоянные условия спецификации (docs/PRINCIPLES.md, Document Template
  // Engine) — заполняются один раз в настройках цеха, подставляются
  // автоматически в каждую сгенерированную спецификацию. nullable, пока не
  // заданы — не изобретаются.
  paymentTerms: string | null;
  deliveryMethod: string | null;
  signerRole: string | null;
  signerName: string | null;
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
