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

  // Владелец проекта, требование до пилота 2026-08-04: "в системе
  // одновременно не может существовать несколько актуальных версий одной
  // спецификации" — прежде чем генерировать новую, находит все документы,
  // которые сейчас считаются текущими для этого заказа, и передаёт их как
  // supersedesDocumentIds (generateSpecificationDocument помечает их
  // isCurrentVersion=false и связывает новый документ через
  // supersedesDocumentId — Immutable Original, docs/PRINCIPLES.md принцип 19,
  // старые версии не удаляются). Инкапсулировано здесь, а не в вызывающем
  // коде — версионность документов принадлежит Document Engine.
  async generateSpecification(
    companyId: string,
    productionOrderId: string,
    uploadedBy: string | null,
    data: SpecificationDocumentData,
  ): Promise<AttachDocumentResult> {
    const existing = await this.listForEntity(companyId, "production_order", productionOrderId);
    // docType="specification" — у заказа со временем появятся и другие
    // привязанные документы (счета, акты), их версионность эта генерация не
    // затрагивает.
    const supersedesDocumentIds = existing.filter((doc) => doc.isCurrentVersion && doc.docType === "specification").map((doc) => doc.id);
    return generateSpecificationDocument(
      { documents: this.documents, documentLinks: this.documentLinks, documentDerivatives: this.documentDerivatives, storage: this.storage, renderer: this.renderer },
      { companyId, productionOrderId, uploadedBy, data, supersedesDocumentIds },
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

  async findById(companyId: string, id: string): Promise<DocumentEntity | null> {
    return this.documents.findById(companyId, id);
  }
}
