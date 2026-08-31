import type { CuttingOrderDocumentData } from "../domain/cutting-order-template";
import { attachDocument, type AttachDocumentResult } from "./attach-document";
import type {
  DocumentDerivativeRepository,
  DocumentLinkRepository,
  DocumentRenderAdapter,
  DocumentRepository,
  StorageAdapter,
} from "./ports";

export const CUTTING_ORDER_DOC_TYPE = "cutting_order";

export interface GenerateCuttingOrderDocumentInput {
  companyId: string;
  cuttingOrderId: string;
  productionOrderId: string;
  /** Номер задания внутри заказа — он же в названии документа. */
  number: number;
  uploadedBy: string | null;
  data: CuttingOrderDocumentData;
  supersedesDocumentIds?: string[];
}

export interface GenerateCuttingOrderDocumentDeps {
  documents: DocumentRepository;
  documentLinks: DocumentLinkRepository;
  documentDerivatives: DocumentDerivativeRepository;
  storage: StorageAdapter;
  renderer: DocumentRenderAdapter;
}

// Раскройное задание в PDF — тот же путь, что и у спецификации: рендер →
// хранилище → documents + document_links → версионность через
// supersedesDocumentId → исходные данные в document_derivatives, чтобы
// документ можно было пересоздать без повторного ввода.
//
// Связей две: с партией (документ виден в общем списке документов заказа) и
// с самим раскройным заданием — иначе при докрое было бы непонятно, какое
// задание какому файлу соответствует.
export async function generateCuttingOrderDocument(
  deps: GenerateCuttingOrderDocumentDeps,
  input: GenerateCuttingOrderDocumentInput,
): Promise<AttachDocumentResult> {
  const pdfBytes = await deps.renderer.renderCuttingOrder(input.data);
  const key = `cutting-orders/${input.companyId}/${input.cuttingOrderId}-${Date.now()}.pdf`;
  const { url } = await deps.storage.upload(key, pdfBytes, "application/pdf");

  const supersedesDocumentIds = input.supersedesDocumentIds ?? [];
  const result = await attachDocument(
    { documents: deps.documents, documentLinks: deps.documentLinks },
    {
      companyId: input.companyId,
      docType: CUTTING_ORDER_DOC_TYPE,
      fileUrl: url,
      title: `Раскройное задание №${input.number}`,
      uploadedBy: input.uploadedBy,
      supersedesDocumentId: supersedesDocumentIds[0] ?? null,
      links: [
        { entityType: "production_order", entityId: input.productionOrderId, source: "manual" },
        { entityType: "cutting_order", entityId: input.cuttingOrderId, source: "manual" },
      ],
    },
  );

  for (const oldId of supersedesDocumentIds) {
    await deps.documents.markSuperseded(input.companyId, oldId);
  }

  await deps.documentDerivatives.create({
    documentId: result.document.id,
    type: "structured_data",
    content: { documentType: CUTTING_ORDER_DOC_TYPE, data: input.data },
    generatedBy: "template-engine:cutting-order@1",
  });

  return result;
}
