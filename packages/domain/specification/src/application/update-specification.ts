import { DomainError } from "../domain/errors";
import { assertCanEdit, assertHasItems, assertIsNewFlowSpecification, assertValidItem, computeSpecificationTotals, type Specification, type SpecificationItemDraft } from "../domain/specification";
import type { ProductVariantLookupPort, SpecificationRepository, WorkshopLookupPort } from "./ports";

export interface UpdateSpecificationInput {
  companyId: string;
  specificationId: string;
  workshopId?: string;
  deliveryDeadline?: string | null;
  items?: SpecificationItemDraft[];
}

export interface UpdateSpecificationDeps {
  specifications: SpecificationRepository;
  workshops: WorkshopLookupPort;
  productVariants: ProductVariantLookupPort;
}

// ПРОМПТ №3, раздел 4/9 — правка спецификации NEW-потока. НЕ применяется к
// legacy-спецификациям (assertIsNewFlowSpecification) — тот путь продолжает
// жить по своим правилам (draft/approve), не подвергается этой логике.
// Изменение здесь НИКОГДА не пишет ничего в production_orders — заказ,
// который породил эту спецификацию, полностью независим от её дальнейшей
// судьбы.
export async function updateSpecification(deps: UpdateSpecificationDeps, input: UpdateSpecificationInput): Promise<Specification> {
  const spec = await deps.specifications.findById(input.companyId, input.specificationId);
  if (!spec) {
    throw new DomainError(`Спецификация ${input.specificationId} не найдена`, "SPECIFICATION_NOT_FOUND");
  }
  assertIsNewFlowSpecification(spec.productionOrderId);
  assertCanEdit(spec.status);

  if (input.workshopId) {
    const workshop = await deps.workshops.findById(input.companyId, input.workshopId);
    if (!workshop) {
      throw new DomainError(`Цех ${input.workshopId} не найден в этой компании`, "SPECIFICATION_WORKSHOP_NOT_FOUND");
    }
  }

  let computedItems: Array<SpecificationItemDraft & { sum: number }> | undefined;
  let totalQuantity: number | undefined;
  let totalSum: number | undefined;
  if (input.items) {
    assertHasItems(input.items);
    for (const item of input.items) assertValidItem(item);
    for (const item of input.items) {
      const variant = await deps.productVariants.findById(input.companyId, item.productVariantId);
      if (!variant) {
        throw new DomainError(`Вариант ${item.productVariantId} не найден в этой компании`, "SPECIFICATION_VARIANT_NOT_FOUND");
      }
      if (variant.productId !== spec.productId) {
        throw new DomainError(
          `Вариант ${item.productVariantId} принадлежит другой модели, не ${spec.productId}`,
          "SPECIFICATION_VARIANT_PRODUCT_MISMATCH",
        );
      }
    }
    const computed = computeSpecificationTotals(input.items);
    computedItems = computed.items;
    totalQuantity = computed.totalQuantity;
    totalSum = computed.totalSum;
  }

  return deps.specifications.update(input.companyId, spec.id, {
    workshopId: input.workshopId,
    deliveryDeadline: input.deliveryDeadline,
    items: computedItems,
    totalQuantity,
    totalSum,
  });
}
