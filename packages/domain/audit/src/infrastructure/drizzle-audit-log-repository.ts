import { auditLog, type DbOrTx } from "@garmentos/db-schema";
import { and, desc, eq } from "drizzle-orm";
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

  async listForEntity(companyId: string, entityType: string, entityId: string): Promise<AuditEntry[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
      .orderBy(desc(auditLog.occurredAt));
    return rows.map(toAuditEntry);
  }
}
