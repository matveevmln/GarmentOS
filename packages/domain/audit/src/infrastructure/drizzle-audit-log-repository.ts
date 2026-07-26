import { auditLog, type DbOrTx } from "@garmentos/db-schema";
import type { AuditEntry } from "../domain/audit-entry";
import type { AuditLogRepository, NewAuditEntryInput } from "../application/ports";

type AuditLogRow = typeof auditLog.$inferSelect;

function toAuditEntry(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    source: row.source,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    inboxSuggestionId: row.inboxSuggestionId,
    occurredAt: row.occurredAt,
  };
}

export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewAuditEntryInput): Promise<AuditEntry> {
    const [row] = await this.db.insert(auditLog).values(input).returning();
    if (!row) throw new Error("INSERT audit_log не вернул строку");
    return toAuditEntry(row);
  }
}
