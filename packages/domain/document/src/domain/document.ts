import { DomainError } from "./errors";

// documents/document_links — существуют в схеме с Итерации 2
// (docs/DATABASE_SCHEMA.md, раздел 15), но без владеющего доменного пакета
// до Итерации 7 (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 0 — этот
// пробел зафиксирован и закрывается здесь). Immutable Original
// (docs/PRINCIPLES.md, принцип 19): fileUrl никогда не изменяется после
// создания — гарантия на уровне БД (триггер documents_file_url_immutable,
// drizzle/0005_document_immutability_trigger.sql), не только соглашением.
export type DocumentLinkSource = "ai" | "manual";

export interface DocumentEntity {
  id: string;
  companyId: string;
  docType: string;
  fileUrl: string;
  title: string | null;
  issuedAt: Date | null;
  uploadedBy: string | null;
  supersedesDocumentId: string | null;
  isCurrentVersion: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentLink {
  id: string;
  companyId: string;
  documentId: string;
  entityType: string;
  entityId: string;
  confidence: string | null;
  source: DocumentLinkSource;
  linkedBy: string | null;
  linkedAt: Date;
}

export function assertValidDocType(docType: string): void {
  if (docType.trim().length === 0) {
    throw new DomainError("Тип документа не может быть пустым", "DOCUMENT_DOC_TYPE_REQUIRED");
  }
}

export function assertValidEntityType(entityType: string): void {
  if (entityType.trim().length === 0) {
    throw new DomainError("Тип связанной сущности не может быть пустым", "DOCUMENT_LINK_ENTITY_TYPE_REQUIRED");
  }
}
