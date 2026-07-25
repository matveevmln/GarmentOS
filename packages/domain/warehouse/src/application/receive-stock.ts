import { assertPositiveQuantity, type StockItem } from "../domain/stock";
import type { StockMovementMeta, StockRepository } from "./ports";

export interface ReceiveStockInput {
  warehouseId: string;
  productVariantId: string;
  quantity: number;
  meta?: StockMovementMeta;
}

export interface ReceiveStockDeps {
  stock: StockRepository;
}

// Приёмка — поступление товара на склад (docs/DATABASE_SCHEMA.md, раздел 9;
// CLAUDE.md, глоссарий «Приёмка»/goodsReceipt). Используется как при приёмке
// готовой партии от цеха (production_order → warehouse), так и при получении
// товара на складе продаж после отгрузки (см. также transfer-stock.ts).
export async function receiveStock(deps: ReceiveStockDeps, input: ReceiveStockInput): Promise<StockItem> {
  assertPositiveQuantity(input.quantity, "Количество приёмки");

  return deps.stock.receive(input.warehouseId, input.productVariantId, input.quantity, input.meta ?? {});
}
