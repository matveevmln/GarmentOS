import { DomainError } from "../domain/errors";
import type { Shipment } from "../domain/shipment";
import { transferStock } from "./transfer-stock";
import type { ShipmentRepository, StockRepository } from "./ports";

export interface DispatchShipmentInput {
  companyId: string;
  shipmentId: string;
}

export interface DispatchShipmentDeps {
  shipments: ShipmentRepository;
  stock: StockRepository;
}

// Фактическая отправка — план (`planned`) становится движением: для каждой
// позиции отгрузки выполняется transferStock (списание с origin, зачисление
// на destination одной транзакцией на позицию), затем статус меняется на
// `in_transit`. Здесь же срабатывает инвариант "недостаточно остатка"
// (transferStock проверяет его сам).
export async function dispatchShipment(deps: DispatchShipmentDeps, input: DispatchShipmentInput): Promise<Shipment> {
  const shipment = await deps.shipments.findById(input.companyId, input.shipmentId);
  if (!shipment) {
    throw new DomainError(`Отгрузка ${input.shipmentId} не найдена в этой компании`, "SHIPMENT_NOT_FOUND");
  }
  if (shipment.status !== "planned") {
    throw new DomainError(
      `Нельзя отправить отгрузку в статусе "${shipment.status}" — отправка доступна только из "planned"`,
      "SHIPMENT_NOT_PLANNED",
    );
  }

  for (const item of shipment.items) {
    await transferStock(
      { stock: deps.stock },
      {
        originWarehouseId: shipment.originWarehouseId,
        destinationWarehouseId: shipment.destinationWarehouseId,
        productVariantId: item.productVariantId,
        quantity: Number(item.quantity),
        meta: { referenceType: "shipment", referenceId: shipment.id },
      },
    );
  }

  return deps.shipments.updateStatus(shipment.id, "in_transit", null);
}
