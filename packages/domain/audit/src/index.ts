// Публичный интерфейс модуля Audit (docs/REPOSITORY_STRUCTURE.md).

export { AUDIT_SOURCES, type AuditEntry, type AuditSource } from "./domain/audit-entry";
export { DomainError } from "./domain/errors";

export type { AuditLogRepository, NewAuditEntryInput } from "./application/ports";
export {
  recordAuditEntry,
  type RecordAuditEntryDeps,
  type RecordAuditEntryInput,
} from "./application/record-audit-entry";

export { DrizzleAuditLogRepository } from "./infrastructure/drizzle-audit-log-repository";
