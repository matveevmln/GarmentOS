import { DEFAULT_SPECIFICATION_TEMPLATE, type SpecificationDocumentData, type SpecificationTemplateDefinition } from "../domain/specification-template";
import type {
  DocumentDerivativeRepository,
  DocumentLinkRepository,
  DocumentRenderAdapter,
  DocumentRepository,
  StorageAdapter,
} from "./ports";
import { attachDocument, type AttachDocumentResult } from "./attach-document";

export interface GenerateSpecificationDocumentInput {
  companyId: string;
  productionOrderId: string;
  uploadedBy: string | null;
  data: SpecificationDocumentData;
  // Разные цеха/компании в будущем используют разные шаблоны (docs/DOCUMENT_ENGINE_ARCHITECTURE.md,
  // раздел 2 — Document Template Engine) — по умолчанию единственный
  // существующий на сегодня шаблон.
  template?: SpecificationTemplateDefinition;
  // Документы, которые замещает эта генерация (владелец проекта, требование
  // до пилота 2026-08-04: "в системе одновременно не может существовать
  // несколько актуальных версий одной спецификации") — обычно один
  // (предыдущая "текущая" версия), но может быть несколько, если из-за
  // прежнего отсутствия этого механизма их накопилось больше одной.
  // Каждый помечается isCurrentVersion=false; supersedesDocumentId нового
  // документа указывает на первый элемент списка (Immutable Original,
  // docs/PRINCIPLES.md принцип 19 — старые строки не удаляются и не
  // перезаписываются, только помечаются неактуальными).
  supersedesDocumentIds?: string[];
}

export interface GenerateSpecificationDocumentDeps {
  documents: DocumentRepository;
  documentLinks: DocumentLinkRepository;
  documentDerivatives: DocumentDerivativeRepository;
  storage: StorageAdapter;
  renderer: DocumentRenderAdapter;
}

// Генерация PDF-спецификации по шаблону (docs/DOCUMENT_ENGINE_ARCHITECTURE.md,
// раздел 2). Помимо самого PDF, сохраняет исходные данные генерации
// (шаблон + версия + подставленные значения) как document_derivative
// (type=structured_data) — без повторного ввода можно пересоздать документ
// позже (требование владельца проекта 2026-07-26).
export async function generateSpecificationDocument(
  deps: GenerateSpecificationDocumentDeps,
  input: GenerateSpecificationDocumentInput,
): Promise<AttachDocumentResult> {
  const template = input.template ?? DEFAULT_SPECIFICATION_TEMPLATE;
  const pdfBytes = await deps.renderer.renderSpecification(template, input.data);
  const key = `specifications/${input.companyId}/${input.productionOrderId}-${Date.now()}.pdf`;
  const { url } = await deps.storage.upload(key, pdfBytes, "application/pdf");

  const supersedesDocumentIds = input.supersedesDocumentIds ?? [];
  const result = await attachDocument(
    { documents: deps.documents, documentLinks: deps.documentLinks },
    {
      companyId: input.companyId,
      docType: "specification",
      fileUrl: url,
      title: `Спецификация №${input.data.fields.specNumber ?? ""}`.trim(),
      uploadedBy: input.uploadedBy,
      supersedesDocumentId: supersedesDocumentIds[0] ?? null,
      links: [{ entityType: "production_order", entityId: input.productionOrderId, source: "ai" }],
    },
  );

  for (const oldId of supersedesDocumentIds) {
    await deps.documents.markSuperseded(input.companyId, oldId);
  }

  // generatedBy — что произвело derivative (движок/версия), не пользователь:
  // "кто из людей инициировал" уже есть на самом documents.uploadedBy.
  await deps.documentDerivatives.create({
    documentId: result.document.id,
    type: "structured_data",
    content: { templateId: template.id, templateVersion: template.version, data: input.data },
    generatedBy: `template-engine:${template.id}@${template.version}`,
  });

  return result;
}
