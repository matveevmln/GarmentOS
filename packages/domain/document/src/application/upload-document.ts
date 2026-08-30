import { assertValidDocType, assertValidEntityType } from "../domain/document";
import { DomainError } from "../domain/errors";
import type { DocumentLinkRepository, DocumentRepository, StorageAdapter } from "./ports";
import { attachDocument, type AttachDocumentResult } from "./attach-document";

// Расширения имени файла к типу содержимого. Список намеренно короткий:
// сегодня партия получает документы от контрагентов, а это подписанные
// сканы и фотографии, не произвольные файлы. Неизвестное расширение —
// явная ошибка, а не «сохраним как есть»: иначе в хранилище со временем
// окажется что угодно, и открыть это будет нечем.
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export interface UploadDocumentInput {
  companyId: string;
  docType: string;
  fileName: string;
  data: Uint8Array;
  /** Куда прикрепляется документ — партия, поставщик, закупка. */
  entityType: string;
  entityId: string;
  title?: string | null;
  issuedAt?: Date | null;
  uploadedBy?: string | null;
  /** Заполняется, когда загружается новая редакция уже имеющегося документа. */
  supersedesDocumentId?: string | null;
}

export interface UploadDocumentDeps {
  documents: DocumentRepository;
  documentLinks: DocumentLinkRepository;
  storage: StorageAdapter;
}

export function resolveContentType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    throw new DomainError(
      `Неподдерживаемый тип файла: ${extension || "без расширения"}. Загрузите PDF, JPG или PNG`,
      "DOCUMENT_UNSUPPORTED_FILE_TYPE",
    );
  }
  return contentType;
}

// Загрузка документа, пришедшего извне (подписанная спецификация, счёт,
// накладная), в отличие от документа, сформированного самой системой
// (generate-specification-document.ts). Оба пути ведут в одни и те же
// таблицы через attachDocument — параллельного хранилища документов не
// возникает.
//
// Загруженный файл НИКОГДА не меняет данные партии: use case записывает
// документ и связь, и ничего больше. Сопоставление содержимого документа с
// данными партии — отдельный шаг поверх document_derivatives, он не
// подменяет доменные записи молча.
export async function uploadDocument(
  deps: UploadDocumentDeps,
  input: UploadDocumentInput,
): Promise<AttachDocumentResult> {
  assertValidDocType(input.docType);
  assertValidEntityType(input.entityType);
  if (input.data.byteLength === 0) {
    throw new DomainError("Файл пустой", "DOCUMENT_FILE_EMPTY");
  }

  const contentType = resolveContentType(input.fileName);

  // Предыдущая редакция проверяется ДО записи в хранилище: иначе при
  // неверной ссылке файл уже лежал бы в бакете без записи в базе.
  if (input.supersedesDocumentId) {
    const previous = await deps.documents.findById(input.companyId, input.supersedesDocumentId);
    if (!previous) {
      throw new DomainError(
        `Предыдущая версия документа ${input.supersedesDocumentId} не найдена в этой компании`,
        "DOCUMENT_NOT_FOUND",
      );
    }
  }

  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const key = `uploads/${input.companyId}/${input.entityType}/${input.entityId}-${Date.now()}.${extension}`;
  const { url } = await deps.storage.upload(key, input.data, contentType);

  const result = await attachDocument(
    { documents: deps.documents, documentLinks: deps.documentLinks },
    {
      companyId: input.companyId,
      docType: input.docType,
      fileUrl: url,
      title: input.title?.trim() || input.fileName,
      issuedAt: input.issuedAt ?? null,
      uploadedBy: input.uploadedBy ?? null,
      supersedesDocumentId: input.supersedesDocumentId ?? null,
      // Документ принесён человеком, а не распознан системой — в отличие от
      // связей, которые проставляет разбор входящих сообщений.
      links: [{ entityType: input.entityType, entityId: input.entityId, source: "manual" }],
    },
  );

  if (input.supersedesDocumentId) {
    await deps.documents.markSuperseded(input.companyId, input.supersedesDocumentId);
  }

  return result;
}
