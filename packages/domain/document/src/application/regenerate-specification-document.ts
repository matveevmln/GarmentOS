import { DEFAULT_SPECIFICATION_TEMPLATE, type SpecificationDocumentData } from "../domain/specification-template";
import { DomainError } from "../domain/errors";
import type { GenerateSpecificationDocumentDeps } from "./generate-specification-document";
import { generateSpecificationDocument } from "./generate-specification-document";
import type { AttachDocumentResult } from "./attach-document";

export interface RegenerateSpecificationDocumentInput {
  companyId: string;
  productionOrderId: string;
  uploadedBy: string | null;
  // Документ, из чьего document_derivative (structured_data) берутся
  // исходные данные генерации.
  sourceDocumentId: string;
}

interface StoredSpecificationDerivative {
  templateId: string;
  templateVersion: number;
  data: SpecificationDocumentData;
}

function isStoredSpecificationDerivative(value: unknown): value is StoredSpecificationDerivative {
  return typeof value === "object" && value !== null && "templateId" in value && "data" in value;
}

// "Открыть любую старую спецификацию и пересоздать её в один клик" —
// требование владельца проекта 2026-07-26. Не хранит собственное состояние:
// читает structured_data derivative, сохранённый предыдущим generateSpecificationDocument,
// и вызывает его же — тот же PDF из тех же данных, новая строка documents
// (Immutable Original, docs/PRINCIPLES.md принцип 19 — не перезаписывает старую).
export async function regenerateSpecificationDocument(
  deps: GenerateSpecificationDocumentDeps,
  input: RegenerateSpecificationDocumentInput,
): Promise<AttachDocumentResult> {
  const derivative = await deps.documentDerivatives.findLatestByDocumentId(input.sourceDocumentId, "structured_data");
  if (!derivative || !isStoredSpecificationDerivative(derivative.content)) {
    throw new DomainError(
      `Для документа ${input.sourceDocumentId} не найдены исходные данные генерации`,
      "DOCUMENT_DERIVATIVE_NOT_FOUND",
    );
  }

  const stored = derivative.content;
  const template = stored.templateId === DEFAULT_SPECIFICATION_TEMPLATE.id ? DEFAULT_SPECIFICATION_TEMPLATE : undefined;
  if (!template) {
    throw new DomainError(`Шаблон "${stored.templateId}" неизвестен — пересоздание недоступно`, "DOCUMENT_TEMPLATE_UNKNOWN");
  }

  return generateSpecificationDocument(deps, {
    companyId: input.companyId,
    productionOrderId: input.productionOrderId,
    uploadedBy: input.uploadedBy,
    data: stored.data,
    template,
  });
}
