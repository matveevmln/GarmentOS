import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { createZodDto } from "nestjs-zod";
import {
  documentResponseSchema,
  listDocumentsForEntityQuerySchema,
  uploadDocumentSchema,
  type DocumentResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { AuditService } from "../audit/audit.service";
import { DocumentService } from "./document.service";

class ListDocumentsForEntityQueryDto extends createZodDto(listDocumentsForEntityQuerySchema) {}
class UploadDocumentBodyDto extends createZodDto(uploadDocumentSchema) {}

// Предел размера загружаемого файла. Подписанный скан спецификации или
// накладной — единицы мегабайт; 20 МБ с запасом покрывают многостраничный
// цветной скан и при этом не дают одним запросом занять память процесса.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Форма загруженного файла в объёме, который здесь реально используется.
// Отдельный пакет типов multer не подключается: сам multer приходит
// транзитивно с @nestjs/platform-express, а новая зависимость ради двух
// полей потребовала бы правки docs/TECH_STACK.md без всякой пользы.
interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

// Показ документов, привязанных к сущности (например, спецификация,
// привязанная к production_order) — минимум, нужный вертикальному сценарию
// Итерации 7 (docs/ROADMAP.md), не универсальный Entity Timeline
// (docs/INBOX_ARCHITECTURE.md, раздел 7.3 — это задел на будущее).
@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly auditService: AuditService,
  ) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async listForEntity(
    @Query() query: ListDocumentsForEntityQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DocumentResponseDto[]> {
    const docs = await this.documentService.listForEntity(currentUser.companyId, query.entityType, query.entityId);
    return docs.map((doc) => documentResponseSchema.parse(doc));
  }

  // Загрузка документа, пришедшего извне: подписанная спецификация, счёт,
  // накладная (Pilot v1, этап 3). Файл идёт частью multipart-запроса,
  // сопровождающие поля — обычными полями формы.
  //
  // Содержимое файла НЕ меняет данные партии: сохраняются документ и связь,
  // и ничего больше. Сопоставление данных документа с данными партии —
  // отдельный шаг поверх document_derivatives, он показывает расхождение
  // пользователю, а не переписывает записи молча.
  @RequirePermissions("contract_manufacturing.write")
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: UploadDocumentBodyDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DocumentResponseDto> {
    if (!file) {
      throw new BadRequestException({
        statusCode: 400,
        code: "DOCUMENT_FILE_REQUIRED",
        message: "Файл не передан",
      });
    }

    const { document } = await this.documentService.upload({
      companyId: currentUser.companyId,
      docType: body.docType,
      fileName: file.originalname,
      data: new Uint8Array(file.buffer),
      entityType: body.entityType,
      entityId: body.entityId,
      title: body.title ?? null,
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : null,
      uploadedBy: currentUser.id,
      supersedesDocumentId: body.supersedesDocumentId ?? null,
    });

    // Документ — часть истории партии, поэтому загрузка попадает в аудит
    // наравне с подтверждением заказа и приёмкой.
    await this.auditService.recordForUser(currentUser, {
      entityType: body.entityType,
      entityId: body.entityId,
      action: "document.uploaded",
      afterJson: {
        documentId: document.id,
        docType: document.docType,
        title: document.title,
        supersedesDocumentId: document.supersedesDocumentId,
      },
    });

    return documentResponseSchema.parse(document);
  }

  // Отдаёт сами байты документа (владелец проекта, 2026-08-03 — «Паспорт
  // партии», раздел «Документы»: кнопка «Открыть» должна реально открывать
  // PDF, не только показывать факт его существования).
  //
  // Раньше локальные файлы стримились, а адреса хранилища отдавались
  // редиректом — это работало только с публичным бакетом, то есть договоры
  // компании читал бы любой, кто знает адрес. Теперь оба случая идут одним
  // путём: адаптер хранилища возвращает байты, права уже проверены.
  @RequirePermissions("contract_manufacturing.read")
  @Get(":id/file")
  async downloadFile(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const found = await this.documentService.readFile(currentUser.companyId, id);
    if (!found) {
      throw new NotFoundException({ statusCode: 404, code: "DOCUMENT_NOT_FOUND", message: `Документ ${id} не найден` });
    }
    const { document, file } = found;

    // Content-Disposition допускает только ASCII в filename= — кириллица
    // ("Спецификация №2") ломает заголовок (ERR_INVALID_CHAR), поэтому имя
    // передаётся в filename* по RFC 5987 (percent-encoded UTF-8), а
    // filename= — безопасный ASCII-фолбэк для старых клиентов.
    const extension = file.contentType === "application/pdf" ? "pdf" : file.contentType.split("/")[1] ?? "bin";
    const rawName = `${document.title ?? document.docType}.${extension}`;
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.data.byteLength));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
    );
    res.end(Buffer.from(file.data));
  }
}
