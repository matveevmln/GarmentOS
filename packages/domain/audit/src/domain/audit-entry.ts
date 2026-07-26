import { DomainError } from "./errors";

// Единый журнал аудита критичных операций (docs/ARCHITECTURE.md, раздел 7) —
// одна запись = один свершившийся факт: кто (userId, всегда конкретный
// человек — ни AI, ни CLI, ни Telegram-бот не получают собственных прав,
// docs/AUTH_ARCHITECTURE.md раздел 13), откуда пришёл вызов (source), что
// произошло (action/entityType/entityId/before-after), и, если действие было
// инициировано AI и подтверждено человеком через Inbox — какое именно
// предложение AI подтвердили (inboxSuggestionId).
export const AUDIT_SOURCES = ["http_api", "cli", "telegram", "ai"] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export interface AuditEntry {
  id: string;
  companyId: string;
  userId: string | null;
  source: AuditSource;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
  inboxSuggestionId: string | null;
  occurredAt: Date;
}

export function assertValidEntityType(entityType: string): void {
  if (entityType.trim().length === 0) {
    throw new DomainError("Тип сущности в записи аудита не может быть пустым", "AUDIT_ENTITY_TYPE_REQUIRED");
  }
}

export function assertValidAction(action: string): void {
  if (action.trim().length === 0) {
    throw new DomainError("Действие в записи аудита не может быть пустым", "AUDIT_ACTION_REQUIRED");
  }
}
