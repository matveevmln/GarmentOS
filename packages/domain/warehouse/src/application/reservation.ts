import { DomainError } from "../domain/errors";
import {
  assertPositiveQuantity,
  assertSufficientAvailable,
  assertSufficientReserved,
  parseQuantity,
  type StockItem,
} from "../domain/stock";
import { assertProductVariantOwnership, assertWarehouseOwnership } from "./assert-ownership";
import type { ProductVariantOwnershipPort, StockRepository, WarehouseRepository } from "./ports";

export interface StockReservationInput {
  companyId: string;
  warehouseId: string;
  productVariantId: string;
  quantity: number;
}

export interface StockReservationDeps {
  stock: StockRepository;
  warehouses: WarehouseRepository;
  productVariants: ProductVariantOwnershipPort;
}

// Резерв остатка — готовит почву для будущей интеграции с Sales
// (docs/ARCHITECTURE.md, п.4.1: Sales → Warehouse.reserveStock()), которая
// сама по себе НЕ реализуется в этой партии (см. ROADMAP.md, решение по
// хореографии; ARCHITECTURE_SELF_REVIEW.md, раздел 11). Резерв не создаёт
// stock_movement — это не физическое движение товара, а мягкая пометка.
//
// companyId проверяется до чтения остатка (SEC-P1, владелец проекта,
// 2026-09-24) — до этого исправления endpoint /stock/reserve вызывался даже
// без аутентифицированного пользователя в контроллере и без какой-либо
// проверки владения складом.
export async function reserveStock(deps: StockReservationDeps, input: StockReservationInput): Promise<StockItem> {
  assertPositiveQuantity(input.quantity, "Количество резерва");
  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.warehouseId);
  await assertProductVariantOwnership(deps.productVariants, input.companyId, input.productVariantId);

  const current = await deps.stock.findStockItem(input.warehouseId, input.productVariantId);
  if (!current) {
    throw new DomainError(
      `На складе ${input.warehouseId} нет остатка по SKU ${input.productVariantId} — резервировать нечего`,
      "STOCK_ITEM_NOT_FOUND",
    );
  }
  assertSufficientAvailable(parseQuantity(current.quantityOnHand), parseQuantity(current.quantityReserved), input.quantity);

  return deps.stock.reserve(input.warehouseId, input.productVariantId, input.quantity);
}

export async function releaseReservation(deps: StockReservationDeps, input: StockReservationInput): Promise<StockItem> {
  assertPositiveQuantity(input.quantity, "Количество снятия резерва");
  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.warehouseId);
  await assertProductVariantOwnership(deps.productVariants, input.companyId, input.productVariantId);

  const current = await deps.stock.findStockItem(input.warehouseId, input.productVariantId);
  if (!current) {
    throw new DomainError(
      `На складе ${input.warehouseId} нет остатка по SKU ${input.productVariantId} — снимать резерв не с чего`,
      "STOCK_ITEM_NOT_FOUND",
    );
  }
  assertSufficientReserved(parseQuantity(current.quantityReserved), input.quantity);

  return deps.stock.release(input.warehouseId, input.productVariantId, input.quantity);
}
