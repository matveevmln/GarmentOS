import { DomainError } from "../domain/errors";
import type { SpecificationItemDraft, Specification } from "../domain/specification";
import { createSpecificationDraft, type CreateSpecificationDraftDeps } from "./create-specification-draft";

export interface CreateSpecificationFromExistingInput {
  companyId: string;
  sourceSpecificationId: string;
  createdBy?: string | null;
  // Всё необязательно — по умолчанию копируется 1:1 из источника. Явное
  // отличие от undefined у deliveryDeadline: null означает "очистить срок",
  // undefined — "оставить как в источнике".
  overrideWorkshopId?: string;
  overrideProductId?: string;
  overrideDeliveryDeadline?: string | null;
  overrideItems?: SpecificationItemDraft[];
}

export type CreateSpecificationFromExistingDeps = CreateSpecificationDraftDeps;

// «Создать на основе существующей» (требование №3) — отдельная операция
// Specification → Specification, НЕ «Следующий заказ» и НЕ supersedes.
// Источник (любого статуса — обычно approved) читается один раз и НИКОГДА
// не изменяется: копирование данных, не связь версий одного документа.
// Результат — полностью независимый черновик со своим id/номером
// (basedOnSpecificationId — чисто информационная ссылка на происхождение).
export async function createSpecificationFromExisting(
  deps: CreateSpecificationFromExistingDeps,
  input: CreateSpecificationFromExistingInput,
): Promise<Specification> {
  const source = await deps.specifications.findById(input.companyId, input.sourceSpecificationId);
  if (!source) {
    throw new DomainError(`Спецификация ${input.sourceSpecificationId} не найдена`, "SPECIFICATION_SOURCE_NOT_FOUND");
  }

  const items: SpecificationItemDraft[] =
    input.overrideItems ??
    source.items.map((item) => ({
      productVariantId: item.productVariantId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

  return createSpecificationDraft(deps, {
    companyId: input.companyId,
    workshopId: input.overrideWorkshopId ?? source.workshopId,
    productId: input.overrideProductId ?? source.productId,
    deliveryDeadline: input.overrideDeliveryDeadline !== undefined ? input.overrideDeliveryDeadline : source.deliveryDeadline,
    items,
    createdBy: input.createdBy ?? null,
    basedOnSpecificationId: source.id,
  });
}
