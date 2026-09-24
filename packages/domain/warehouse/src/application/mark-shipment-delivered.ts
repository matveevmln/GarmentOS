import { DomainError } from "../domain/errors";
import { assertCanMarkDelivered, type Shipment } from "../domain/shipment";
import { assertWarehouseOwnership } from "./assert-ownership";
import type { ShipmentRepository, WarehouseRepository } from "./ports";

export interface MarkShipmentDeliveredInput {
  companyId: string;
  shipmentId: string;
}

export interface MarkShipmentDeliveredDeps {
  shipments: ShipmentRepository;
  warehouses: WarehouseRepository;
}

// Доставка не двигает остаток (см. docs/GOS-PARTY-V1-AUDIT.md, раздел
// 14.3 — только статус и дата), поэтому здесь нет риска перемещения чужого
// остатка. Проверка происхождения (SEC-P1, владелец проекта, 2026-09-24)
// сохранена для единообразия с dispatchShipment и на случай отгрузок,
// заведённых до исправления createShipment с чужими ссылками на склад.
export async function markShipmentDelivered(
  deps: MarkShipmentDeliveredDeps,
  input: MarkShipmentDeliveredInput,
): Promise<Shipment> {
  const shipment = await deps.shipments.findById(input.companyId, input.shipmentId);
  if (!shipment) {
    throw new DomainError(`Отгрузка ${input.shipmentId} не найдена в этой компании`, "SHIPMENT_NOT_FOUND");
  }
  assertCanMarkDelivered(shipment.status);

  await assertWarehouseOwnership(deps.warehouses, input.companyId, shipment.originWarehouseId);
  await assertWarehouseOwnership(deps.warehouses, input.companyId, shipment.destinationWarehouseId);

  return deps.shipments.updateStatus(shipment.id, "delivered", new Date());
}
