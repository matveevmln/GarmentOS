import { DomainError } from "../domain/errors";
import { assertCanMarkDelivered, type Shipment } from "../domain/shipment";
import type { ShipmentRepository } from "./ports";

export interface MarkShipmentDeliveredInput {
  companyId: string;
  shipmentId: string;
}

export interface MarkShipmentDeliveredDeps {
  shipments: ShipmentRepository;
}

export async function markShipmentDelivered(
  deps: MarkShipmentDeliveredDeps,
  input: MarkShipmentDeliveredInput,
): Promise<Shipment> {
  const shipment = await deps.shipments.findById(input.companyId, input.shipmentId);
  if (!shipment) {
    throw new DomainError(`Отгрузка ${input.shipmentId} не найдена в этой компании`, "SHIPMENT_NOT_FOUND");
  }
  assertCanMarkDelivered(shipment.status);

  return deps.shipments.updateStatus(shipment.id, "delivered", new Date());
}
