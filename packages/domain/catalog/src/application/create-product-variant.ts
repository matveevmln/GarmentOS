import { assertValidColor, assertValidSize, assertValidSkuCode, type ProductVariant } from "../domain/product-variant";
import { DomainError } from "../domain/errors";
import type { ProductVariantRepository } from "./ports";

export interface CreateProductVariantInput {
  productId: string;
  size: string;
  color: string;
  skuCode: string;
  barcode?: string;
  createdBy?: string;
}

export interface CreateProductVariantDeps {
  productVariants: ProductVariantRepository;
}

// Инвариант: (productId, size, color) уникальны — одна и та же модель не
// может иметь два SKU с одинаковым сочетанием размера и цвета
// (docs/DATABASE_SCHEMA.md, раздел 5). Код SKU (артикул) уникален глобально.
export async function createProductVariant(
  deps: CreateProductVariantDeps,
  input: CreateProductVariantInput,
): Promise<ProductVariant> {
  const size = input.size.trim();
  const color = input.color.trim();
  const skuCode = input.skuCode.trim();

  assertValidSize(size);
  assertValidColor(color);
  assertValidSkuCode(skuCode);

  const duplicateCombination = await deps.productVariants.findByProductSizeColor(input.productId, size, color);
  if (duplicateCombination) {
    throw new DomainError(
      `У этой модели уже есть SKU с размером "${size}" и цветом "${color}"`,
      "PRODUCT_VARIANT_SIZE_COLOR_TAKEN",
    );
  }

  const duplicateSku = await deps.productVariants.findBySkuCode(skuCode);
  if (duplicateSku) {
    throw new DomainError(`SKU с кодом "${skuCode}" уже существует`, "PRODUCT_VARIANT_SKU_CODE_TAKEN");
  }

  return deps.productVariants.create({
    productId: input.productId,
    size,
    color,
    skuCode,
    barcode: input.barcode ?? null,
    createdBy: input.createdBy ?? null,
  });
}
