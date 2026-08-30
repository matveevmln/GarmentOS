import type { DocumentDerivativeType, DocumentEntity, DocumentLink, DocumentLinkSource } from "../domain/document";
import type { SpecificationDocumentData, SpecificationTemplateDefinition } from "../domain/specification-template";

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
  // Снимает флаг "текущая версия" (owner, требование до пилота, 2026-08-04:
  // "в системе одновременно не может существовать несколько актуальных
  // версий одной спецификации") — вызывается при генерации новой версии для
  // всех документов, которые она замещает.
  markSuperseded(companyId: string, id: string): Promise<void>;
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

export interface DocumentDerivativeEntity {
  id: string;
  documentId: string;
  type: DocumentDerivativeType;
  content: unknown;
  language: string | null;
  generatedBy: string | null;
  createdAt: Date;
}

export interface NewDocumentDerivativeInput {
  documentId: string;
  type: DocumentDerivativeType;
  content: unknown;
  language?: string | null;
  generatedBy?: string | null;
}

// Хранит исходные данные, из которых сгенерирован документ (шаблон + версия +
// подставленные значения) — не для отображения пользователю, а чтобы
// пересоздать документ позже без повторного ввода данных ("открыть старую
// спецификацию и пересоздать её в один клик" — требование владельца проекта
// 2026-07-26). type='structured_data' — уже существующий тип в document_derivatives
// (docs/PRINCIPLES.md, принцип 19), не новый.
export interface DocumentDerivativeRepository {
  create(input: NewDocumentDerivativeInput): Promise<DocumentDerivativeEntity>;
  findLatestByDocumentId(documentId: string, type: string): Promise<DocumentDerivativeEntity | null>;
}

// За интерфейсом (docs/INFRASTRUCTURE.md, раздел 2.3; docs/DOCUMENT_ENGINE_ARCHITECTURE.md,
// раздел 1) — конкретная реализация (S3-совместимое хранилище/MinIO в проде,
// локальная файловая система для тестов) не зашита в домен.
export interface StoredFile {
  data: Uint8Array;
  contentType: string;
}

export interface StorageAdapter {
  upload(key: string, data: Uint8Array, contentType: string): Promise<{ url: string }>;
  // Чтение по тому же адресу, который вернул upload. Раньше файл отдавался
  // редиректом на этот адрес, но приватный бакет по прямой ссылке недоступен
  // — а публичный бакет означал бы, что договоры и спецификации компании
  // читает любой, кто знает адрес. Поэтому байты проходят через API, где уже
  // проверены вход и права; формат адреса знает сам адаптер, документ хранит
  // только строку.
  download(fileUrl: string): Promise<StoredFile | null>;
}

// DocumentRenderAdapter (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 2) —
// тем же паттерном, что StorageAdapter/MarketplaceConnector: конкретная
// технология рендеринга (pdf-lib на старте, docs/TECH_STACK.md) не зашита
// в use case. Шаблон передаётся явно (Document Template Engine) — рендерер
// не хранит и не выбирает шаблон сам, только раскладывает переданные
// структуру+данные в PDF.
export interface DocumentRenderAdapter {
  renderSpecification(template: SpecificationTemplateDefinition, data: SpecificationDocumentData): Promise<Uint8Array>;
}
