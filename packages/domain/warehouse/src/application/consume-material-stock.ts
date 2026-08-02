import { DomainError } from "../domain/errors";
import {
  assertPositiveMaterialQuantity,
  assertSufficientMaterialAvailable,
  parseMaterialQuantity,
  type MaterialStockItem,
} from "../domain/material-stock";
import type { MaterialStockMovementMeta, MaterialStockRepository } from "./ports";

export interface ConsumeMaterialStockInput {
  warehouseId: string;
  materialId: string;
  quantity: number;
  meta?: MaterialStockMovementMeta;
}

export interface ConsumeMaterialStockDeps {
  materialStock: MaterialStockRepository;
}

// Расход материала — вызывается при подтверждении заказа пошива (материал
// передан цеху для запуска в производство, владелец проекта, 2026-08-02).
// Инвариант: нельзя списать больше, чем есть на складе — та же логика, что
// dispatch-stock.ts для готовых SKU, но без резервирования (материалы не
// резервируются отдельно, в отличие от SKU).
export async function consumeMaterialStock(
  deps: ConsumeMaterialStockDeps,
  input: ConsumeMaterialStockInput,
): Promise<MaterialStockItem> {
  assertPositiveMaterialQuantity(input.quantity, "Количество расхода материала");

  const current = await deps.materialStock.findMaterialStockItem(input.warehouseId, input.materialId);
  if (!current) {
    throw new DomainError(
      `На складе ${input.warehouseId} нет остатка по материалу ${input.materialId} — списывать нечего`,
      "MATERIAL_STOCK_ITEM_NOT_FOUND",
    );
  }
  assertSufficientMaterialAvailable(parseMaterialQuantity(current.quantityOnHand), input.quantity);

  return deps.materialStock.consume(input.warehouseId, input.materialId, input.quantity, input.meta ?? {});
}
