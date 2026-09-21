import { ACT_TEMPLATE } from "../domain/act-template";
import type { SpecificationDocumentData, SpecificationTemplateDefinition } from "../domain/specification-template";
import type {
  DocumentDerivativeRepository,
  DocumentLinkRepository,
  DocumentRenderAdapter,
  DocumentRepository,
  StorageAdapter,
} from "./ports";
import { attachDocument, type AttachDocumentResult } from "./attach-document";

// Акт приёмки оказанных услуг — тот же генератор, что и спецификация
// (generate-specification-document.ts), другой шаблон и docType (владелец
// проекта, 2026-09-21). Отдельная функция, а не параметр у существующей —
// тот же приём, что уже применён к раскройному заданию: docType/название
// документа завязаны на конкретный тип документа внутри функции, поэтому
// параметризовать одну функцию третьим типом значило бы либо плодить if
// внутри неё, либо протаскивать docType/title как отдельные входные поля,
// теряя единственный источник истины "что за документ" (сам факт вызова
// конкретной функции).
export interface GenerateActDocumentInput {
  companyId: string;
  entityType: string;
  entityId: string;
  uploadedBy: string | null;
  data: SpecificationDocumentData;
  template?: SpecificationTemplateDefinition;
  supersedesDocumentIds?: string[];
}

export interface GenerateActDocumentDeps {
  documents: DocumentRepository;
  documentLinks: DocumentLinkRepository;
  documentDerivatives: DocumentDerivativeRepository;
  storage: StorageAdapter;
  renderer: DocumentRenderAdapter;
}

export async function generateActDocument(
  deps: GenerateActDocumentDeps,
  input: GenerateActDocumentInput,
): Promise<AttachDocumentResult> {
  const template = input.template ?? ACT_TEMPLATE;
  const pdfBytes = await deps.renderer.renderSpecification(template, input.data);
  const key = `acts/${input.companyId}/${input.entityId}-${Date.now()}.pdf`;
  const { url } = await deps.storage.upload(key, pdfBytes, "application/pdf");

  const supersedesDocumentIds = input.supersedesDocumentIds ?? [];
  const result = await attachDocument(
    { documents: deps.documents, documentLinks: deps.documentLinks },
    {
      companyId: input.companyId,
      docType: "act",
      fileUrl: url,
      title: `Акт №${input.data.fields.actNumber ?? ""}`.trim(),
      uploadedBy: input.uploadedBy,
      supersedesDocumentId: supersedesDocumentIds[0] ?? null,
      links: [{ entityType: input.entityType, entityId: input.entityId, source: "ai" }],
    },
  );

  for (const oldId of supersedesDocumentIds) {
    await deps.documents.markSuperseded(input.companyId, oldId);
  }

  await deps.documentDerivatives.create({
    documentId: result.document.id,
    type: "structured_data",
    content: { templateId: template.id, templateVersion: template.version, data: input.data },
    generatedBy: `template-engine:${template.id}@${template.version}`,
  });

  return result;
}
