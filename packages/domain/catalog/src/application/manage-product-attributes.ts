import { DomainError } from "../domain/errors";
import { assertValidProductAttribute, type ProductAttribute, type ProductAttributeDraft } from "../domain/product-attribute";
import type { ProductAttributeRepository, ProductRepository } from "./ports";

export interface ManageProductAttributesDeps {
  products: ProductRepository;
  productAttributes: ProductAttributeRepository;
}

async function assertProductOwnership(deps: ManageProductAttributesDeps, companyId: string, productId: string): Promise<void> {
  const product = await deps.products.findById(companyId, productId);
  if (!product) {
    throw new DomainError(`Модель ${productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
  }
}

export interface AddProductAttributeInput {
  companyId: string;
  productId: string;
  name: string;
  value: string;
}

// «+ Добавить характеристику» (владелец проекта, требование №3) — список
// растёт по одной строке за раз, не заменяется целиком, в отличие от
// размерного ряда: характеристики независимы друг от друга.
export async function addProductAttribute(
  deps: ManageProductAttributesDeps,
  input: AddProductAttributeInput,
): Promise<ProductAttribute> {
  await assertProductOwnership(deps, input.companyId, input.productId);
  const draft: ProductAttributeDraft = { name: input.name.trim(), value: input.value.trim() };
  assertValidProductAttribute(draft);
  return deps.productAttributes.create(input.productId, draft);
}

export interface UpdateProductAttributeInput {
  companyId: string;
  productId: string;
  attributeId: string;
  name: string;
  value: string;
}

export async function updateProductAttribute(
  deps: ManageProductAttributesDeps,
  input: UpdateProductAttributeInput,
): Promise<ProductAttribute> {
  await assertProductOwnership(deps, input.companyId, input.productId);
  const existing = await deps.productAttributes.findById(input.productId, input.attributeId);
  if (!existing) {
    throw new DomainError(`Характеристика ${input.attributeId} не найдена у этой модели`, "PRODUCT_ATTRIBUTE_NOT_FOUND");
  }
  const draft: ProductAttributeDraft = { name: input.name.trim(), value: input.value.trim() };
  assertValidProductAttribute(draft);
  return deps.productAttributes.update(input.attributeId, draft);
}

export interface RemoveProductAttributeInput {
  companyId: string;
  productId: string;
  attributeId: string;
}

export async function removeProductAttribute(
  deps: ManageProductAttributesDeps,
  input: RemoveProductAttributeInput,
): Promise<void> {
  await assertProductOwnership(deps, input.companyId, input.productId);
  const existing = await deps.productAttributes.findById(input.productId, input.attributeId);
  if (!existing) {
    throw new DomainError(`Характеристика ${input.attributeId} не найдена у этой модели`, "PRODUCT_ATTRIBUTE_NOT_FOUND");
  }
  await deps.productAttributes.remove(input.attributeId);
}
