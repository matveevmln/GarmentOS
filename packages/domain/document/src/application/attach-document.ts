import { assertValidDocType, assertValidEntityType, type DocumentEntity, type DocumentLink, type DocumentLinkSource } from "../domain/document";
import { DomainError } from "../domain/errors";
import type { DocumentLinkRepository, DocumentRepository } from "./ports";

export interface AttachDocumentLinkTarget {
  entityType: string;
  entityId: string;
  confidence?: string | null;
  source: DocumentLinkSource;
}

export interface AttachDocumentInput {
  companyId: string;
  docType: string;
  fileUrl: string;
  title?: string | null;
  issuedAt?: Date | null;
  uploadedBy?: string | null;
  supersedesDocumentId?: string | null;
  // Один документ обычно относится сразу к нескольким сущностям
  // (docs/PRINCIPLES.md, принцип 18) — минимум одна связь обязательна,
  // иначе документ осиротеет и не найдётся ни на одной карточке.
  links: AttachDocumentLinkTarget[];
}

export interface AttachDocumentDeps {
  documents: DocumentRepository;
  documentLinks: DocumentLinkRepository;
}

export interface AttachDocumentResult {
  document: DocumentEntity;
  links: DocumentLink[];
}

export async function attachDocument(deps: AttachDocumentDeps, input: AttachDocumentInput): Promise<AttachDocumentResult> {
  const docType = input.docType.trim();
  assertValidDocType(docType);
  if (input.links.length === 0) {
    throw new DomainError("Документ должен быть привязан хотя бы к одной сущности", "DOCUMENT_LINK_REQUIRED");
  }
  for (const link of input.links) {
    assertValidEntityType(link.entityType);
  }

  const document = await deps.documents.create({
    companyId: input.companyId,
    docType,
    fileUrl: input.fileUrl,
    title: input.title ?? null,
    issuedAt: input.issuedAt ?? null,
    uploadedBy: input.uploadedBy ?? null,
    supersedesDocumentId: input.supersedesDocumentId ?? null,
  });

  const links: DocumentLink[] = [];
  for (const link of input.links) {
    links.push(
      await deps.documentLinks.create({
        companyId: input.companyId,
        documentId: document.id,
        entityType: link.entityType,
        entityId: link.entityId,
        confidence: link.confidence ?? null,
        source: link.source,
        linkedBy: input.uploadedBy ?? null,
      }),
    );
  }

  return { document, links };
}
