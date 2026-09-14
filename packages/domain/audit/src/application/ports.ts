import type { AuditEntry, AuditSource } from "../domain/audit-entry";

export interface NewAuditEntryInput {
  companyId: string;
  userId: string | null;
  source: AuditSource;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
  inboxSuggestionId: string | null;
}

export interface AuditLogRepository {
  create(input: NewAuditEntryInput): Promise<AuditEntry>;
  // «История» карточки сущности (Этап 2 — «Паспорт модели», владелец
  // проекта, 2026-09-12) — до сих пор audit_log был write-only из apps/api:
  // записи писались, но нигде не читались обратно. Новее сначала — история
  // читается как лента, самое недавнее событие наверху.
  listForEntity(companyId: string, entityType: string, entityId: string): Promise<AuditEntry[]>;
}
