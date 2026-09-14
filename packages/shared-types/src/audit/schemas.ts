import { z } from "zod";

// Контракты модуля Audit (docs/ARCHITECTURE.md, раздел 7). До Этапа 2 —
// «Паспорт модели» (владелец проекта, 2026-09-12) — audit_log был write-only
// со стороны apps/api: записи писались, но нигде не отдавались обратно.
// «История» карточки сущности — первый читатель.
export const auditEntryResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  source: z.enum(["http_api", "cli", "telegram", "ai"]),
  entityType: z.string(),
  entityId: z.string().uuid(),
  action: z.string(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  inboxSuggestionId: z.string().uuid().nullable(),
  occurredAt: z.date(),
});
export type AuditEntryResponseDto = z.infer<typeof auditEntryResponseSchema>;

export const listAuditEntriesQuerySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
});
export type ListAuditEntriesQueryDto = z.infer<typeof listAuditEntriesQuerySchema>;
