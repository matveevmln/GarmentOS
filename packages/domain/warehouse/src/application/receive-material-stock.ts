import { assertPositiveMaterialQuantity, type MaterialStockItem } from "../domain/material-stock";
import type { MaterialStockMovementMeta, MaterialStockRepository } from "./ports";

export interface ReceiveMaterialStockInput {
  warehouseId: string;
  materialId: string;
  quantity: number;
  meta?: MaterialStockMovementMeta;
}

export interface ReceiveMaterialStockDeps {
  materialStock: MaterialStockRepository;
}

// Приёмка материала на склад — вызывается при приёмке закупки
// (docs/DATABASE_SCHEMA.md, раздел 6; владелец проекта, 2026-08-02). Тот же
// принцип, что receive-stock.ts для готовых SKU.
export async function receiveMaterialStock(
  deps: ReceiveMaterialStockDeps,
  input: ReceiveMaterialStockInput,
): Promise<MaterialStockItem> {
  assertPositiveMaterialQuantity(input.quantity, "Количество приёмки материала");

  return deps.materialStock.receive(input.warehouseId, input.materialId, input.quantity, input.meta ?? {});
}
