import { DomainError } from "./errors";

// Уведомление пользователю (низкий остаток, срыв срока заказа у цеха и т.п.)
// — docs/DATABASE_SCHEMA.md, раздел 16. `type` не жёсткий enum в БД —
// валидируется на уровне application layer, как suggestion_type у Inbox.
export interface Notification {
  id: string;
  companyId: string;
  userId: string;
  type: string;
  payloadJson: unknown;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidType(type: string): void {
  if (type.trim().length === 0) {
    throw new DomainError("Тип уведомления не может быть пустым", "NOTIFICATION_TYPE_REQUIRED");
  }
}

export function assertNotAlreadyRead(readAt: Date | null): void {
  if (readAt !== null) {
    throw new DomainError("Уведомление уже отмечено прочитанным", "NOTIFICATION_ALREADY_READ");
  }
}
