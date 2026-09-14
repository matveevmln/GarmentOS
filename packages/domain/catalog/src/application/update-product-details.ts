import { DomainError } from "../domain/errors";
import { assertValidProductName, type Product } from "../domain/product";
import type { ProductRepository } from "./ports";

export interface UpdateProductDetailsInput {
  companyId: string;
  productId: string;
  name?: string;
  category?: string | null;
  description?: string | null;
}

export interface UpdateProductDetailsDeps {
  products: ProductRepository;
}

// Правка паспорта модели (Этап 2 — «Паспорт модели», владелец проекта,
// 2026-09-12) — название/категория/описание, отдельно от плановой
// себестоимости (updateProductCosts) и от размерного ряда/цветов (свои use
// case). undefined-поле не трогает сохранённое значение — PATCH одним полем
// не должен стирать остальные.
export async function updateProductDetails(
  deps: UpdateProductDetailsDeps,
  input: UpdateProductDetailsInput,
): Promise<Product> {
  const existing = await deps.products.findById(input.companyId, input.productId);
  if (!existing) {
    throw new DomainError(`Модель ${input.productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined) assertValidProductName(name);

  return deps.products.updateDetails(input.companyId, input.productId, {
    name,
    category: input.category,
    description: input.description,
  });
}
