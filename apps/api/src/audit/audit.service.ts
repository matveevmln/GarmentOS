import { Inject, Injectable } from "@nestjs/common";
import { recordAuditEntry, type AuditLogRepository, type AuditSource } from "@garmentos/domain-audit";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AUDIT_LOG_REPOSITORY } from "./audit.tokens";

export interface RecordAuditParams {
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
}

// Тонкий адаптер поверх packages/domain/audit (docs/ARCHITECTURE.md, раздел 2)
// — единственная точка, через которую любой модуль apps/api пишет в
// audit_log. Существующие сервисы вызывают её сами, после того как доменный
// use case уже успешно выполнился (recordAuditEntry не выполняет саму
// операцию, только фиксирует её результат).
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository) {}

  async record(
    companyId: string,
    userId: string | null,
    source: AuditSource,
    params: RecordAuditParams,
  ): Promise<void> {
    await recordAuditEntry({ auditLog: this.auditLog }, { companyId, userId, source, ...params });
  }

  // Частный случай record() для обычного HTTP-запроса аутентифицированного
  // пользователя — источник вызова здесь всегда http_api, инициатор — тот же
  // пользователь, что выполнил операцию (docs/AUTH_ARCHITECTURE.md, раздел 13:
  // AI/Telegram/CLI действуют от имени человека, не от своего собственного).
  async recordForUser(currentUser: AuthenticatedRequestUser, params: RecordAuditParams): Promise<void> {
    await this.record(currentUser.companyId, currentUser.id, "http_api", params);
  }
}
