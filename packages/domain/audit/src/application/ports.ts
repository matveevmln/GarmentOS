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
}
