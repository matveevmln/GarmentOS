import { DomainError } from "../domain/errors";
import { assertHasItems, assertValidItem, computeSpecificationTotals, type Specification, type SpecificationItemDraft } from "../domain/specification";
import type { ProductLookupPort, ProductVariantLookupPort, SpecificationRepository, WorkshopLookupPort } from "./ports";

export interface CreateSpecificationDraftInput {
  companyId: string;
  workshopId: string;
  productId: string;
  deliveryDeadline?: string | null;
  items: SpecificationItemDraft[];
  createdBy?: string | null;
  // Заполняется только createSpecificationFromExisting — обычное создание
  // черновика его не передаёт (требование №3: происхождение "на основе",
  // не supersedes — см. domain/specification.ts).
  basedOnSpecificationId?: string | null;
}

export interface CreateSpecificationDraftDeps {
  specifications: SpecificationRepository;
  workshops: WorkshopLookupPort;
  products: ProductLookupPort;
  productVariants: ProductVariantLookupPort;
}

// Создаёт спецификацию как черновик — первый шаг производства (владелец
// проекта, 2026-09-11), не производный документ заказа. Номер НЕ
// присваивается здесь (см. approveSpecification) — черновик может быть
// брошен без последствий для нумерации.
export async function createSpecificationDraft(
  deps: CreateSpecificationDraftDeps,
  input: CreateSpecificationDraftInput,
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

  // Каждая строка обязана ссылаться на реальный вариант ЭТОЙ модели — иначе
  // спецификация на «Худи Пилот» могла бы молча содержать размер/цвет
  // другой модели.
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

  return deps.specifications.create({
    companyId: input.companyId,
    workshopId: input.workshopId,
    productId: input.productId,
    status: "draft",
    version: 1,
    basedOnSpecificationId: input.basedOnSpecificationId ?? null,
    deliveryDeadline: input.deliveryDeadline ?? null,
    totalQuantity,
    totalSum,
    createdBy: input.createdBy ?? null,
    items,
  });
}
