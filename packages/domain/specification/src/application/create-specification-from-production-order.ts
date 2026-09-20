import { DomainError } from "../domain/errors";
import { assertHasItems, assertValidItem, computePrepaymentAmount, computeSpecificationTotals, type Specification, type SpecificationItemDraft } from "../domain/specification";
import type { ProductLookupPort, ProductVariantLookupPort, SpecificationRepository, WorkshopLookupPort } from "./ports";

export interface CreateSpecificationFromProductionOrderInput {
  companyId: string;
  productionOrderId: string;
  workshopId: string;
  productId: string;
  deliveryDeadline: string | null;
  // Уже разрешённые по цене строки (rework=0 / new=цена строки или заказа) —
  // считает вызывающий слой (apps/api), переиспользуя ту же функцию
  // (specification-pricing.ts), что уже применяется для заказов пошива —
  // домен Specification не обязан знать о rework/new-семантике заказа
  // (docs/PRINCIPLES.md, принцип 2).
  items: SpecificationItemDraft[];
  createdBy: string | null;
}

export interface CreateSpecificationFromProductionOrderDeps {
  specifications: SpecificationRepository;
  workshops: WorkshopLookupPort;
  products: ProductLookupPort;
  productVariants: ProductVariantLookupPort;
}

// ПРОМПТ №3, раздел 4 — Specification создаётся ИЗ уже существующего
// заказа. В отличие от createSpecificationDraft (legacy, статус "draft",
// номер откладывается до approve), здесь: номер резервируется СРАЗУ (тем же
// атомарным счётчиком цеха), статус сразу "approved" (в этом потоке нет
// отдельного шага согласования — сама спецификация уже и есть готовый
// документ), snapshotJson НЕ заполняется (PDF в этом потоке всегда собирается
// из ТЕКУЩЕГО состояния, см. specification.service.ts#generateDocument).
// Изменения спецификации после создания НИКОГДА не пишутся обратно в заказ —
// это не projection поверх заказа, а независимая копия его данных на момент
// создания (ПРОМПТ №3, раздел 4: "последующие изменения Specification НЕ
// изменяют Production Order").
export async function createSpecificationFromProductionOrder(
  deps: CreateSpecificationFromProductionOrderDeps,
  input: CreateSpecificationFromProductionOrderInput,
): Promise<Specification> {
  assertHasItems(input.items);
  for (const item of input.items) assertValidItem(item);

  const workshop = await deps.workshops.findById(input.companyId, input.workshopId);
  if (!workshop) {
    throw new DomainError(`Цех ${input.workshopId} не найден в этой компании`, "SPECIFICATION_WORKSHOP_NOT_FOUND");
  }

  const product = await deps.products.findById(input.companyId, input.productId);
  if (!product) {
    throw new DomainError(`Модель ${input.productId} не найдена в этой компании`, "SPECIFICATION_PRODUCT_NOT_FOUND");
  }

  for (const item of input.items) {
    const variant = await deps.productVariants.findById(input.companyId, item.productVariantId);
    if (!variant) {
      throw new DomainError(`Вариант ${item.productVariantId} не найден в этой компании`, "SPECIFICATION_VARIANT_NOT_FOUND");
    }
    if (variant.productId !== input.productId) {
      throw new DomainError(
        `Вариант ${item.productVariantId} принадлежит другой модели, не ${input.productId}`,
        "SPECIFICATION_VARIANT_PRODUCT_MISMATCH",
      );
    }
  }

  const { totalQuantity, totalSum, items } = computeSpecificationTotals(input.items);
  const specNumber = await deps.workshops.reserveNextSpecificationNumber(input.workshopId);
  const prepaymentAmount = computePrepaymentAmount(totalSum);

  return deps.specifications.create({
    companyId: input.companyId,
    workshopId: input.workshopId,
    productId: input.productId,
    productionOrderId: input.productionOrderId,
    status: "approved",
    version: 1,
    basedOnSpecificationId: null,
    specNumber,
    prepaymentAmount,
    deliveryDeadline: input.deliveryDeadline,
    totalQuantity,
    totalSum,
    createdBy: input.createdBy,
    items,
  });
}
