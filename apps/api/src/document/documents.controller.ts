import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { documentResponseSchema, listDocumentsForEntityQuerySchema, type DocumentResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { DocumentService } from "./document.service";

class ListDocumentsForEntityQueryDto extends createZodDto(listDocumentsForEntityQuerySchema) {}

// Показ документов, привязанных к сущности (например, спецификация,
// привязанная к production_order) — минимум, нужный вертикальному сценарию
// Итерации 7 (docs/ROADMAP.md), не универсальный Entity Timeline
// (docs/INBOX_ARCHITECTURE.md, раздел 7.3 — это задел на будущее).
@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentService: DocumentService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async listForEntity(
    @Query() query: ListDocumentsForEntityQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DocumentResponseDto[]> {
    const docs = await this.documentService.listForEntity(currentUser.companyId, query.entityType, query.entityId);
    return docs.map((doc) => documentResponseSchema.parse(doc));
  }
}
