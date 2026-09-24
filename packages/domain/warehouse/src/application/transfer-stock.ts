import { DomainError } from "../domain/errors";
import { assertPositiveQuantity, assertSufficientAvailable, parseQuantity, type StockItem } from "../domain/stock";
import { assertProductVariantOwnership, assertWarehouseOwnership } from "./assert-ownership";
import type { ProductVariantOwnershipPort, StockMovementMeta, StockRepository, WarehouseRepository } from "./ports";

export interface TransferStockInput {
  companyId: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  productVariantId: string;
  quantity: number;
  meta?: StockMovementMeta;
}

export interface TransferStockDeps {
  stock: StockRepository;
  warehouses: WarehouseRepository;
  productVariants: ProductVariantOwnershipPort;
}

// Перемещение между СВОИМИ складами (docs/DATABASE_SCHEMA.md, раздел 9/10;
// CLAUDE.md, глоссарий: stock_movements.type='transfer'). Второй из двух
// инвариантов, названных в ROADMAP.md для Итерации 3: запрет transfer при
// недостатке остатка на складе-источнике.
//
// Источник И назначение проверяются на принадлежность companyId ДО чтения
// остатка (SEC-P1, владелец проекта, 2026-09-24): без этого компания B
// могла указать склад компании A как источник или назначение перемещения,
// зная только его UUID. Эта же функция вызывается из dispatchShipment — там
// повторная проверка защищает от устаревших отгрузок, созданных до
// исправления (docs/GOS-PARTY-V1-AUDIT.md, раздел 14.3).
export async function transferStock(
  deps: TransferStockDeps,
  input: TransferStockInput,
): Promise<{ origin: StockItem; destination: StockItem }> {
  assertPositiveQuantity(input.quantity, "Количество перемещения");
  if (input.originWarehouseId === input.destinationWarehouseId) {
    throw new DomainError("Склад отправления и назначения не могут совпадать", "STOCK_TRANSFER_SAME_WAREHOUSE");
  }
  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.originWarehouseId);
  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.destinationWarehouseId);
  await assertProductVariantOwnership(deps.productVariants, input.companyId, input.productVariantId);

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
