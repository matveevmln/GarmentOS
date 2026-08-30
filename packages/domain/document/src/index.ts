// Публичный интерфейс модуля Document (docs/REPOSITORY_STRUCTURE.md).

export type { DocumentDerivativeType, DocumentEntity, DocumentLink, DocumentLinkSource } from "./domain/document";
export { DomainError } from "./domain/errors";
export {
  applyPlaceholders,
  DEFAULT_SPECIFICATION_TEMPLATE,
  type SpecificationColumnKey,
  type SpecificationDocumentData,
  type SpecificationLineItem,
  type SpecificationSignatureBlock,
  type SpecificationTemplateColumn,
  type SpecificationTemplateDefinition,
} from "./domain/specification-template";

export type {
  DocumentDerivativeEntity,
  DocumentDerivativeRepository,
  DocumentLinkRepository,
  DocumentRenderAdapter,
  DocumentRepository,
  NewDocumentDerivativeInput,
  NewDocumentInput,
  NewDocumentLinkInput,
  StorageAdapter,
  StoredFile,
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
  uploadDocument,
  resolveContentType,
  type UploadDocumentDeps,
  type UploadDocumentInput,
} from "./application/upload-document";
export {
  regenerateSpecificationDocument,
  type RegenerateSpecificationDocumentInput,
} from "./application/regenerate-specification-document";
export {
  listDocumentsForEntity,
  type ListDocumentsForEntityDeps,
  type ListDocumentsForEntityInput,
} from "./application/list-documents-for-entity";

export {
  DrizzleDocumentDerivativeRepository,
  DrizzleDocumentLinkRepository,
  DrizzleDocumentRepository,
} from "./infrastructure/drizzle-document-repository";
export { PdfLibTemplateRenderer } from "./infrastructure/pdf-lib-template-renderer";
export { S3StorageAdapter, type S3StorageAdapterConfig } from "./infrastructure/s3-storage-adapter";
