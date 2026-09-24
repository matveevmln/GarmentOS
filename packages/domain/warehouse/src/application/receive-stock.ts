import { assertPositiveQuantity, type StockItem } from "../domain/stock";
import { assertProductVariantOwnership, assertWarehouseOwnership } from "./assert-ownership";
import type { ProductVariantOwnershipPort, StockMovementMeta, StockRepository, WarehouseRepository } from "./ports";

export interface ReceiveStockInput {
  companyId: string;
  warehouseId: string;
  productVariantId: string;
  quantity: number;
  meta?: StockMovementMeta;
}

export interface ReceiveStockDeps {
  stock: StockRepository;
  warehouses: WarehouseRepository;
  productVariants: ProductVariantOwnershipPort;
}

// Приёмка — поступление товара на склад (docs/DATABASE_SCHEMA.md, раздел 9;
// CLAUDE.md, глоссарий «Приёмка»/goodsReceipt). Используется как при приёмке
// готовой партии от цеха (production_order → warehouse), так и при получении
// товара на складе продаж после отгрузки (см. также transfer-stock.ts).
//
// companyId обязателен и проверяется здесь, а не только контроллером
// (SEC-P1, владелец проекта, 2026-09-24): warehouseId и productVariantId
// приходят из тела запроса, и без этой проверки компания B могла записать
// остаток на склад компании A, зная только UUID склада (воспроизведено в
// docs/GOS-PARTY-V1-AUDIT.md, раздел 12, сценарий P1).
export async function receiveStock(deps: ReceiveStockDeps, input: ReceiveStockInput): Promise<StockItem> {
  assertPositiveQuantity(input.quantity, "Количество приёмки");
  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.warehouseId);
  await assertProductVariantOwnership(deps.productVariants, input.companyId, input.productVariantId);

  return deps.stock.receive(input.warehouseId, input.productVariantId, input.quantity, input.meta ?? {});
}
