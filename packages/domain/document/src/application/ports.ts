import type { DocumentEntity, DocumentLink, DocumentLinkSource } from "../domain/document";

export interface NewDocumentInput {
  companyId: string;
  docType: string;
  fileUrl: string;
  title: string | null;
  issuedAt: Date | null;
  uploadedBy: string | null;
  supersedesDocumentId?: string | null;
}

export interface DocumentRepository {
  create(input: NewDocumentInput): Promise<DocumentEntity>;
  findById(companyId: string, id: string): Promise<DocumentEntity | null>;
}

export interface NewDocumentLinkInput {
  companyId: string;
  documentId: string;
  entityType: string;
  entityId: string;
  confidence: string | null;
  source: DocumentLinkSource;
  linkedBy: string | null;
}

export interface DocumentLinkRepository {
  create(input: NewDocumentLinkInput): Promise<DocumentLink>;
  listForEntity(companyId: string, entityType: string, entityId: string): Promise<DocumentLink[]>;
}

// За интерфейсом (docs/INFRASTRUCTURE.md, раздел 2.3; docs/DOCUMENT_ENGINE_ARCHITECTURE.md,
// раздел 1) — конкретная реализация (S3-совместимое хранилище/MinIO в проде,
// локальная файловая система для тестов) не зашита в домен.
export interface StorageAdapter {
  upload(key: string, data: Uint8Array, contentType: string): Promise<{ url: string }>;
}

export interface SpecificationPdfVariant {
  size: string;
  color: string;
  quantity: string;
}

export interface SpecificationPdfMaterial {
  materialName: string;
  unit: string;
  totalQuantity: string;
}

export interface SpecificationPdfData {
  productName: string;
  workshopName: string;
  variants: SpecificationPdfVariant[];
  materials: SpecificationPdfMaterial[];
  dueDate: string | null;
}

// DocumentRenderAdapter (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 2) —
// тем же паттерном, что StorageAdapter/MarketplaceConnector: конкретная
// технология рендеринга (pdf-lib на старте, docs/TECH_STACK.md) не зашита
// в use case.
export interface DocumentRenderAdapter {
  renderSpecification(data: SpecificationPdfData): Promise<Uint8Array>;
}
