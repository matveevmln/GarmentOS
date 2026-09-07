import { DomainError } from "../domain/errors";
import { assertNonNegativeCost, type Product } from "../domain/product";
import type { ProductRepository } from "./ports";

export interface UpdateProductCostsInput {
  companyId: string;
  productId: string;
  standardSewingCost?: number;
  standardSewingCostCurrency?: string;
  otherProductionCost?: number;
  otherProductionCostCurrency?: string;
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

  // Валюта — своя у каждой суммы (P1, hardening перед «Стеганкой», владелец
  // проекта, 2026-09-07): явно переданное значение побеждает; иначе валюта,
  // уже сохранённая на модели, сохраняется как есть; и только если сумма
  // задаётся ВПЕРВЫЕ (валюты ещё не было вовсе) — запасное значение RUB, то
  // же самое, что раньше было жёстко зашито в costing.service.ts. Молчаливая
  // конвертация или угадывание валюты для уже заданной суммы недопустимы.
  const standardSewingCostCurrency =
    input.standardSewingCostCurrency ??
    existing.standardSewingCostCurrency ??
    (input.standardSewingCost !== undefined ? "RUB" : null);
  const otherProductionCostCurrency =
    input.otherProductionCostCurrency ??
    existing.otherProductionCostCurrency ??
    (input.otherProductionCost !== undefined ? "RUB" : null);

  return deps.products.updateCosts(input.companyId, input.productId, {
    standardSewingCost:
      input.standardSewingCost !== undefined ? String(input.standardSewingCost) : existing.standardSewingCost,
    standardSewingCostCurrency,
    otherProductionCost:
      input.otherProductionCost !== undefined ? String(input.otherProductionCost) : existing.otherProductionCost,
    otherProductionCostCurrency,
  });
}
