import { createReadStream } from "node:fs";
import { Controller, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
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

  // Отдаёт сами байты документа (владелец проекта, 2026-08-03 — «Паспорт
  // партии», раздел «Документы»: кнопка «Открыть» должна реально открывать
  // PDF, не только показывать факт его существования). До этого fileUrl
  // указывал либо на реальный публичный S3-адрес (уже открывается напрямую),
  // либо на локальный диск разработки ("file://...") — недостижим из
  // браузера напрямую по соображениям безопасности. Локальные файлы
  // стримятся через API; S3-адреса — редирект (не тратим память процесса на
  // то, что и так публично доступно). Жёстко предполагает PDF — единственный
  // тип, который сегодня генерирует Document Engine.
  @RequirePermissions("contract_manufacturing.read")
  @Get(":id/file")
  async downloadFile(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const doc = await this.documentService.findById(currentUser.companyId, id);
    if (!doc) {
      throw new NotFoundException({ statusCode: 404, code: "DOCUMENT_NOT_FOUND", message: `Документ ${id} не найден` });
    }
    if (doc.fileUrl.startsWith("file://")) {
      const filePath = doc.fileUrl.slice("file://".length);
      // Content-Disposition допускает только ASCII в filename= — кириллица
      // ("Спецификация №2") ломает заголовок (ERR_INVALID_CHAR), поэтому имя
      // передаётся в filename* по RFC 5987 (percent-encoded UTF-8), а
      // filename= — безопасный ASCII-фолбэк для старых клиентов.
      const rawName = `${doc.title ?? doc.docType}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
      );
      createReadStream(filePath).pipe(res);
      return;
    }
    res.redirect(doc.fileUrl);
  }
}
