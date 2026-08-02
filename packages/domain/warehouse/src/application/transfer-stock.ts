import { DomainError } from "../domain/errors";
import { assertPositiveQuantity, assertSufficientAvailable, parseQuantity, type StockItem } from "../domain/stock";
import type { StockMovementMeta, StockRepository } from "./ports";

export interface TransferStockInput {
  originWarehouseId: string;
  destinationWarehouseId: string;
  productVariantId: string;
  quantity: number;
  meta?: StockMovementMeta;
}

export interface TransferStockDeps {
  stock: StockRepository;
}

// Перемещение между СВОИМИ складами (docs/DATABASE_SCHEMA.md, раздел 9/10;
// CLAUDE.md, глоссарий: stock_movements.type='transfer'). Второй из двух
// инвариантов, названных в ROADMAP.md для Итерации 3: запрет transfer при
// недостатке остатка на складе-источнике.
export async function transferStock(
  deps: TransferStockDeps,
  input: TransferStockInput,
): Promise<{ origin: StockItem; destination: StockItem }> {
  assertPositiveQuantity(input.quantity, "Количество перемещения");
  if (input.originWarehouseId === input.destinationWarehouseId) {
    throw new DomainError("Склад отправления и назначения не могут совпадать", "STOCK_TRANSFER_SAME_WAREHOUSE");
  }

  const originStock = await deps.stock.findStockItem(input.originWarehouseId, input.productVariantId);
  if (!originStock) {
    throw new DomainError(
      `На складе ${input.originWarehouseId} нет остатка по SKU ${input.productVariantId} — перемещать нечего`,
      "STOCK_ITEM_NOT_FOUND",
    );
  }
  assertSufficientAvailable(
    parseQuantity(originStock.quantityOnHand),
    parseQuantity(originStock.quantityReserved),
    input.quantity,
  );

  return deps.stock.transfer(
    input.originWarehouseId,
    input.destinationWarehouseId,
    input.productVariantId,
    input.quantity,
    input.meta ?? {},
  );
}
