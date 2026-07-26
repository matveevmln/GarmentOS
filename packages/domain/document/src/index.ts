// Публичный интерфейс модуля Document (docs/REPOSITORY_STRUCTURE.md).

export type { DocumentEntity, DocumentLink, DocumentLinkSource } from "./domain/document";
export { DomainError } from "./domain/errors";

export type {
  DocumentLinkRepository,
  DocumentRenderAdapter,
  DocumentRepository,
  NewDocumentInput,
  NewDocumentLinkInput,
  SpecificationPdfData,
  SpecificationPdfMaterial,
  SpecificationPdfVariant,
  StorageAdapter,
} from "./application/ports";
export {
  attachDocument,
  type AttachDocumentDeps,
  type AttachDocumentInput,
  type AttachDocumentLinkTarget,
  type AttachDocumentResult,
} from "./application/attach-document";
export {
  generateSpecificationDocument,
  type GenerateSpecificationDocumentDeps,
  type GenerateSpecificationDocumentInput,
} from "./application/generate-specification-document";
export {
  listDocumentsForEntity,
  type ListDocumentsForEntityDeps,
  type ListDocumentsForEntityInput,
} from "./application/list-documents-for-entity";

export { DrizzleDocumentLinkRepository, DrizzleDocumentRepository } from "./infrastructure/drizzle-document-repository";
export { PdfLibSpecificationRenderer } from "./infrastructure/pdf-lib-specification-renderer";
export { S3StorageAdapter, type S3StorageAdapterConfig } from "./infrastructure/s3-storage-adapter";
