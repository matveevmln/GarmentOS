import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  confirmDocumentRequestSchema,
  confirmDocumentResponseSchema,
  extractDocumentRequestSchema,
  extractDocumentResponseSchema,
  type ConfirmDocumentResponseDto,
  type ExtractDocumentResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { DocumentIntelligenceService } from "./document-intelligence.service";

class ExtractDocumentDto extends createZodDto(extractDocumentRequestSchema) {}
class ConfirmDocumentDto extends createZodDto(confirmDocumentRequestSchema) {}

// P6 (Document Intelligence, владелец проекта, 2026-09-06) — извлечение
// данных инвойса/пакинг-листа из текста и подтверждённое сохранение в
// Materials & Procurement. Право переиспользуется целиком: это тот же
// доступ, что и у ручного создания материалов/закупок (procurement.*),
// новое право не заводится.
@ApiTags("document-intelligence")
@Controller("document-intelligence")
export class DocumentIntelligenceController {
  constructor(private readonly documentIntelligenceService: DocumentIntelligenceService) {}

  // Шаги "загрузка/вставка → извлечение → показ оператору" задания —
  // ничего не пишет в materials/suppliers/purchase_orders, только в
  // document_derivatives (предложение).
  @RequirePermissions("procurement.write")
  @Post("extract")
  async extract(
    @Body() body: ExtractDocumentDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ExtractDocumentResponseDto> {
    const result = await this.documentIntelligenceService.extract(currentUser, body);
    return extractDocumentResponseSchema.parse(result);
  }

  // Единственный эндпоинт, вызывающий детерминированные доменные use
  // case'ы (createMaterial/createSupplier/createPurchaseOrderDraft) — только
  // после того, как оператор передал подтверждённые значения.
  @RequirePermissions("procurement.write")
  @Post("confirm")
  async confirm(
    @Body() body: ConfirmDocumentDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ConfirmDocumentResponseDto> {
    const result = await this.documentIntelligenceService.confirm(currentUser, body);
    return confirmDocumentResponseSchema.parse(result);
  }
}
