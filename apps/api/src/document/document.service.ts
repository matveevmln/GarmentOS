import { Inject, Injectable } from "@nestjs/common";
import {
  generateSpecificationDocument,
  listDocumentsForEntity,
  type AttachDocumentResult,
  type DocumentDerivativeRepository,
  type DocumentEntity,
  type DocumentLinkRepository,
  type DocumentRenderAdapter,
  type DocumentRepository,
  type SpecificationDocumentData,
  type StorageAdapter,
} from "@garmentos/domain-document";
import {
  DOCUMENT_DERIVATIVE_REPOSITORY,
  DOCUMENT_LINK_REPOSITORY,
  DOCUMENT_RENDERER,
  DOCUMENT_REPOSITORY,
  STORAGE_ADAPTER,
} from "./document.tokens";

// Тонкий presentation-адаптер поверх packages/domain/document
// (docs/ARCHITECTURE.md, раздел 2) — минимальный Document Engine Итерации 7
// (только generateSpecification + listForEntity, без версий/Word/e-signature).
@Injectable()
export class DocumentService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_LINK_REPOSITORY) private readonly documentLinks: DocumentLinkRepository,
    @Inject(DOCUMENT_DERIVATIVE_REPOSITORY) private readonly documentDerivatives: DocumentDerivativeRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderAdapter,
  ) {}

  async generateSpecification(
    companyId: string,
    productionOrderId: string,
    uploadedBy: string | null,
    data: SpecificationDocumentData,
  ): Promise<AttachDocumentResult> {
    return generateSpecificationDocument(
      { documents: this.documents, documentLinks: this.documentLinks, documentDerivatives: this.documentDerivatives, storage: this.storage, renderer: this.renderer },
      { companyId, productionOrderId, uploadedBy, data },
    );
  }

  // Возвращает сами документы (с fileUrl), а не только связи — "показ
  // спецификации" сценария Итерации 7 нуждается в реальной ссылке на PDF, не
  // только в факте связи.
  async listForEntity(companyId: string, entityType: string, entityId: string): Promise<DocumentEntity[]> {
    const links = await listDocumentsForEntity({ documentLinks: this.documentLinks }, { companyId, entityType, entityId });
    const docs = await Promise.all(links.map((link) => this.documents.findById(companyId, link.documentId)));
    return docs.filter((doc): doc is DocumentEntity => doc !== null);
  }
}
