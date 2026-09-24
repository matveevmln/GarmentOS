import { assertDifferentWarehouses, assertHasItems, type Shipment, type ShipmentItemDraft } from "../domain/shipment";
import { assertPositiveQuantity } from "../domain/stock";
import { assertProductVariantOwnership, assertWarehouseOwnership } from "./assert-ownership";
import type { ProductVariantOwnershipPort, ShipmentRepository, WarehouseRepository } from "./ports";

export interface CreateShipmentInput {
  companyId: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  carrierId?: string;
  trackingNumber?: string;
  items: ShipmentItemDraft[];
  createdBy?: string;
}

export interface CreateShipmentDeps {
  shipments: ShipmentRepository;
  warehouses: WarehouseRepository;
  productVariants: ProductVariantOwnershipPort;
}

// Создаёт отгрузку как план (status='planned') — паперворк/декларация о
// намерении переместить товар, БЕЗ немедленного движения остатка. Физическое
// перемещение (проверка достаточности остатка + запись stock_movements)
// происходит на шаге dispatchShipment — так планирование не блокируется
// текущим остатком (можно спланировать заранее), а движение остаётся
// атомарным единым событием в момент фактической отправки.
//
// Источник, назначение и КАЖДЫЙ SKU строки проверяются на принадлежность
// companyId до записи (SEC-P1, владелец проекта, 2026-09-24): раньше
// createShipment принимал origin/destination/SKU из тела запроса без единой
// проверки владения — отгрузку можно было завести на чужой склад
// (docs/GOS-PARTY-V1-AUDIT.md, раздел 14.3). Проверка всех строк идёт до
// вызова репозитория — при отказе на последней позиции ни одна строка не
// записывается.
export async function createShipment(deps: CreateShipmentDeps, input: CreateShipmentInput): Promise<Shipment> {
  assertHasItems(input.items);
  assertDifferentWarehouses(input.originWarehouseId, input.destinationWarehouseId);
  for (const item of input.items) assertPositiveQuantity(item.quantity, "Количество в отгрузке");

  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.originWarehouseId);
  await assertWarehouseOwnership(deps.warehouses, input.companyId, input.destinationWarehouseId);
  for (const item of input.items) {
    await assertProductVariantOwnership(deps.productVariants, input.companyId, item.productVariantId);
  }

  return deps.shipments.create({
    companyId: input.companyId,
    originWarehouseId: input.originWarehouseId,
    destinationWarehouseId: input.destinationWarehouseId,
    carrierId: input.carrierId ?? null,
    trackingNumber: input.trackingNumber ?? null,
    createdBy: input.createdBy ?? null,
    items: input.items,
  });
}
