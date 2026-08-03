import { DomainError } from "../domain/errors";
import { assertNonNegativeCost, type Product } from "../domain/product";
import type { ProductRepository } from "./ports";

export interface UpdateProductCostsInput {
  companyId: string;
  productId: string;
  standardSewingCost?: number;
  otherProductionCost?: number;
}

export interface UpdateProductCostsDeps {
  products: ProductRepository;
}

// Плановые составляющие себестоимости модели, не выводимые из BOM
// (docs/PRODUCT_MODEL_ARCHITECTURE.md, раздел 6) — редактируются отдельно
// от создания модели, поэтому отдельный use case, не часть createProduct.
export async function updateProductCosts(
  deps: UpdateProductCostsDeps,
  input: UpdateProductCostsInput,
): Promise<Product> {
  const existing = await deps.products.findById(input.companyId, input.productId);
  if (!existing) {
    throw new DomainError(`Модель ${input.productId} не найдена в этой компании`, "PRODUCT_NOT_FOUND");
  }
  if (input.standardSewingCost !== undefined) assertNonNegativeCost(input.standardSewingCost, "Стоимость пошива");
  if (input.otherProductionCost !== undefined) assertNonNegativeCost(input.otherProductionCost, "Прочие расходы");

  return deps.products.updateCosts(input.companyId, input.productId, {
    standardSewingCost:
      input.standardSewingCost !== undefined ? String(input.standardSewingCost) : existing.standardSewingCost,
    otherProductionCost:
      input.otherProductionCost !== undefined ? String(input.otherProductionCost) : existing.otherProductionCost,
  });
}
