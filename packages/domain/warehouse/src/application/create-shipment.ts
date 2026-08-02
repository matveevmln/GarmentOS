import { assertDifferentWarehouses, assertHasItems, type Shipment, type ShipmentItemDraft } from "../domain/shipment";
import { assertPositiveQuantity } from "../domain/stock";
import type { ShipmentRepository } from "./ports";

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
}

// Создаёт отгрузку как план (status='planned') — паперворк/декларация о
// намерении переместить товар, БЕЗ немедленного движения остатка. Физическое
// перемещение (проверка достаточности остатка + запись stock_movements)
// происходит на шаге dispatchShipment — так планирование не блокируется
// текущим остатком (можно спланировать заранее), а движение остаётся
// атомарным единым событием в момент фактической отправки.
export async function createShipment(deps: CreateShipmentDeps, input: CreateShipmentInput): Promise<Shipment> {
  assertHasItems(input.items);
  assertDifferentWarehouses(input.originWarehouseId, input.destinationWarehouseId);
  for (const item of input.items) assertPositiveQuantity(item.quantity, "Количество в отгрузке");

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
