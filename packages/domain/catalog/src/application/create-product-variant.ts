import { assertValidColor, assertValidSize, assertValidSkuCode, type ProductVariant } from "../domain/product-variant";
import { DomainError } from "../domain/errors";
import type { ProductRepository, ProductVariantRepository } from "./ports";

export interface CreateProductVariantInput {
  companyId: string;
  productId: string;
  size: string;
  color: string;
  skuCode: string;
  barcode?: string;
  createdBy?: string;
}

export interface CreateProductVariantDeps {
  productVariants: ProductVariantRepository;
  products: ProductRepository;
}

// Инвариант: (productId, size, color) уникальны — одна и та же модель не
// может иметь два SKU с одинаковым сочетанием размера и цвета
// (docs/DATABASE_SCHEMA.md, раздел 5). Код SKU (артикул) уникален глобально.
//
// Принадлежность модели компании проверяется здесь, а не в контроллере (тот
// же порядок, что и в addProductColor): productId приходит из тела запроса,
// и без этой проверки можно было бы добавить SKU к чужой модели, зная её
// UUID (Step 4A.2).
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

  const product = await deps.products.findById(input.companyId, input.productId);
  if (!product) {
    throw new DomainError(`Модель ${input.productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
  }

  const duplicateCombination = await deps.productVariants.findByProductSizeColor(
    input.companyId,
    input.productId,
    size,
    color,
  );
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
