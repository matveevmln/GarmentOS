import { DomainError } from "../domain/errors";
import { assertValidSizeRatios, type ProductSize, type ProductSizeDraft } from "../domain/product-size";
import type { ProductRepository, ProductSizeRepository, ProductVariantRepository } from "./ports";

export interface ManageProductSizesDeps {
  products: ProductRepository;
  productSizes: ProductSizeRepository;
}

export interface ReplaceProductSizesInput {
  companyId: string;
  productId: string;
  sizes: ProductSizeDraft[];
}

// Замена размерного ряда модели. Порядок берётся из порядка переданного
// массива — так, как пользователь выстроил размеры на экране; выводить его из
// названий нельзя («S»/«M»/«L» алфавитно сортируются неверно).
//
// Уже созданные заказы правка не затрагивает: их матрица размер×цвет живёт
// собственными строками (production_order_variants) и физически не связана с
// этой таблицей.
export async function replaceProductSizes(
  deps: ManageProductSizesDeps,
  input: ReplaceProductSizesInput,
): Promise<ProductSize[]> {
  assertValidSizeRatios(input.sizes);

  const product = await deps.products.findById(input.companyId, input.productId);
  if (!product) {
    throw new DomainError(`Модель ${input.productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
  }

  return deps.productSizes.replaceForProduct(
    input.productId,
    input.sizes.map((row) => ({ size: row.size.trim(), ratioWeight: row.ratioWeight })),
  );
}

export interface AddProductColorDeps extends ManageProductSizesDeps {
  productVariants: ProductVariantRepository;
}

export interface AddProductColorInput {
  companyId: string;
  productId: string;
  color: string;
  colorCode: string;
  createdBy?: string | null;
}

// Добавление цвета создаёт варианты сразу на все размеры ряда: сетка
// 5 размеров × 3 цвета иначе требует пятнадцати ручных операций (владелец
// проекта, 2026-08-30 — «не хочу каждый раз заносить эти данные заново»).
//
// Артикул собирается по предсказуемому шаблону «код модели-размер-код цвета».
// Код цвета вводит человек: транслитерация «Петроль» машиной была бы
// угадыванием, а артикул попадает в документы.
//
// Уже существующие сочетания пропускаются, а не пересоздаются — повторный
// вызов безопасен и не спотыкается об уникальность (модель, размер, цвет).
export async function addProductColor(
  deps: AddProductColorDeps,
  input: AddProductColorInput,
): Promise<{ created: number; skipped: number }> {
  const color = input.color.trim();
  const colorCode = input.colorCode.trim();
  if (color.length === 0) {
    throw new DomainError("Название цвета не может быть пустым", "PRODUCT_VARIANT_COLOR_REQUIRED");
  }
  if (colorCode.length === 0) {
    throw new DomainError("Код цвета нужен для артикула", "PRODUCT_COLOR_CODE_REQUIRED");
  }

  const product = await deps.products.findById(input.companyId, input.productId);
  if (!product) {
    throw new DomainError(`Модель ${input.productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
  }

  const sizes = await deps.productSizes.listByProduct(input.productId);
  if (sizes.length === 0) {
    throw new DomainError(
      "У модели не задан размерный ряд — сначала укажите размеры и раскладку",
      "PRODUCT_SIZES_NOT_DEFINED",
    );
  }

  let created = 0;
  let skipped = 0;
  for (const size of sizes) {
    const existing = await deps.productVariants.findByProductSizeColor(input.productId, size.size, color);
    if (existing) {
      skipped += 1;
      continue;
    }
    await deps.productVariants.create({
      productId: input.productId,
      size: size.size,
      color,
      skuCode: `${product.code}-${size.size}-${colorCode}`,
      barcode: null,
      createdBy: input.createdBy ?? null,
    });
    created += 1;
  }

  return { created, skipped };
}
