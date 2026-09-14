import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { auditEntryResponseSchema, listAuditEntriesQuerySchema, type AuditEntryResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequireAnyPermission } from "../auth/require-permissions.decorator";
import { AuditService } from "./audit.service";

class ListAuditEntriesQueryDto extends createZodDto(listAuditEntriesQuerySchema) {}

// «История» карточки сущности (Этап 2 — «Паспорт модели», владелец проекта,
// 2026-09-12) — первый читатель ранее write-only audit_log. Generic-эндпоинт
// по entityType/entityId, тот же принцип, что и GET /documents: одна карточка
// (модель, спецификация, цех, партия...) показывает вкладку «История», не
// заводя отдельный API на каждый тип сущности.
//
// RequireAnyPermission — та же логика, что и у Document Engine: история
// относится к разным доменам, читателю достаточно права read ЛЮБОГО из них,
// а не обязательно того самого модуля, к которому принадлежит entityType.
const AUDIT_READ_PERMISSIONS = ["contract_manufacturing.read", "catalog.read", "specification.read"];

@ApiTags("audit")
@Controller("audit-log")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequireAnyPermission(...AUDIT_READ_PERMISSIONS)
  @Get()
  async listForEntity(
    @Query() query: ListAuditEntriesQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<AuditEntryResponseDto[]> {
    const entries = await this.auditService.listForEntity(currentUser.companyId, query.entityType, query.entityId);
    return entries.map((entry) => auditEntryResponseSchema.parse(entry));
  }
}
