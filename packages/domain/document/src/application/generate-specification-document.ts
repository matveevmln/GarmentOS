import type { DocumentRenderAdapter, DocumentLinkRepository, DocumentRepository, SpecificationPdfData, StorageAdapter } from "./ports";
import { attachDocument, type AttachDocumentResult } from "./attach-document";

export interface GenerateSpecificationDocumentInput {
  companyId: string;
  productionOrderId: string;
  uploadedBy: string | null;
  data: SpecificationPdfData;
}

export interface GenerateSpecificationDocumentDeps {
  documents: DocumentRepository;
  documentLinks: DocumentLinkRepository;
  storage: StorageAdapter;
  renderer: DocumentRenderAdapter;
}

// Единственный сценарий Итерации 7 (docs/DOCUMENT_ENGINE_ARCHITECTURE.md,
// раздел 2) — генерация PDF-спецификации из уже посчитанных данных заказа
// пошива и привязка её к production_order. Полный generateDocument (шаблоны
// на doc_type, несколько типов документов) — расширение по мере появления
// второго реального формата, не сейчас (docs/PRINCIPLES.md, принцип 3).
export async function generateSpecificationDocument(
  deps: GenerateSpecificationDocumentDeps,
  input: GenerateSpecificationDocumentInput,
): Promise<AttachDocumentResult> {
  const pdfBytes = await deps.renderer.renderSpecification(input.data);
  const key = `specifications/${input.companyId}/${input.productionOrderId}-${Date.now()}.pdf`;
  const { url } = await deps.storage.upload(key, pdfBytes, "application/pdf");

  return attachDocument(
    { documents: deps.documents, documentLinks: deps.documentLinks },
    {
      companyId: input.companyId,
      docType: "specification",
      fileUrl: url,
      title: `Спецификация — ${input.data.productName}`,
      uploadedBy: input.uploadedBy,
      links: [{ entityType: "production_order", entityId: input.productionOrderId, source: "ai" }],
    },
  );
}
