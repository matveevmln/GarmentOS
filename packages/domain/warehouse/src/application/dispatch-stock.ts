import { DomainError } from "../domain/errors";
import { assertPositiveQuantity, assertSufficientAvailable, parseQuantity, type StockItem } from "../domain/stock";
import type { StockMovementMeta, StockRepository } from "./ports";

export interface DispatchStockInput {
  warehouseId: string;
  productVariantId: string;
  quantity: number;
  meta?: StockMovementMeta;
}

export interface DispatchStockDeps {
  stock: StockRepository;
}

// Окончательное выбытие товара при продаже (docs/DATABASE_SCHEMA.md,
// раздел 9; CLAUDE.md, глоссарий «dispatch», не путать с shipment). Ключевой
// инвариант Итерации 3 (USER_JOURNEY_AUDIT.md/ROADMAP.md): запрет списания
// при недостатке остатка.
export async function dispatchStock(deps: DispatchStockDeps, input: DispatchStockInput): Promise<StockItem> {
  assertPositiveQuantity(input.quantity, "Количество списания");

  const current = await deps.stock.findStockItem(input.warehouseId, input.productVariantId);
  if (!current) {
    throw new DomainError(
      `На складе ${input.warehouseId} нет остатка по SKU ${input.productVariantId} — списывать нечего`,
      "STOCK_ITEM_NOT_FOUND",
    );
  }
  assertSufficientAvailable(parseQuantity(current.quantityOnHand), parseQuantity(current.quantityReserved), input.quantity);

  return deps.stock.dispatch(input.warehouseId, input.productVariantId, input.quantity, input.meta ?? {});
}
