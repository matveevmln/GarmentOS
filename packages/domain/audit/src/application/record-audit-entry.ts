import { assertValidAction, assertValidEntityType, type AuditEntry, type AuditSource } from "../domain/audit-entry";
import type { AuditLogRepository } from "./ports";

export interface RecordAuditEntryInput {
  companyId: string;
  userId: string | null;
  source: AuditSource;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  inboxSuggestionId?: string | null;
}

export interface RecordAuditEntryDeps {
  auditLog: AuditLogRepository;
}

// Единственный вход для записи в audit_log — из HTTP API, CLI-скриптов,
// будущего Telegram-бота (Итерация 9) и AI-подтверждённых действий (будущий
// AI Production Assistant, Фаза 2) одинаково: разница только в `source` и,
// для AI, в заполненном `inboxSuggestionId` (docs/AUTH_ARCHITECTURE.md,
// раздел 13). Само действие уже свершилось к моменту вызова — recordAuditEntry
// не выполняет бизнес-операцию, только фиксирует её результат.
export async function recordAuditEntry(deps: RecordAuditEntryDeps, input: RecordAuditEntryInput): Promise<AuditEntry> {
  const entityType = input.entityType.trim();
  const action = input.action.trim();
  assertValidEntityType(entityType);
  assertValidAction(action);

  return deps.auditLog.create({
    companyId: input.companyId,
    userId: input.userId,
    source: input.source,
    entityType,
    entityId: input.entityId,
    action,
    beforeJson: input.beforeJson ?? null,
    afterJson: input.afterJson ?? null,
    inboxSuggestionId: input.inboxSuggestionId ?? null,
  });
}
