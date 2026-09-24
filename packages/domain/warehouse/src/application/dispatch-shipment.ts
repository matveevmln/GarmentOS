import { DomainError } from "../domain/errors";
import type { Shipment } from "../domain/shipment";
import { assertProductVariantOwnership, assertWarehouseOwnership } from "./assert-ownership";
import { transferStock } from "./transfer-stock";
import type { ProductVariantOwnershipPort, ShipmentRepository, StockRepository, WarehouseRepository } from "./ports";

export interface DispatchShipmentInput {
  companyId: string;
  shipmentId: string;
}

export interface DispatchShipmentDeps {
  shipments: ShipmentRepository;
  stock: StockRepository;
  warehouses: WarehouseRepository;
  productVariants: ProductVariantOwnershipPort;
}

// Фактическая отправка — план (`planned`) становится движением: для каждой
// позиции отгрузки выполняется transferStock (списание с origin, зачисление
// на destination одной транзакцией на позицию), затем статус меняется на
// `in_transit`. Здесь же срабатывает инвариант "недостаточно остатка"
// (transferStock проверяет его сам).
//
// SEC-P1 (владелец проекта, 2026-09-24): origin/destination и SKU каждой
// позиции повторно проверяются на принадлежность companyId ДО первого
// движения остатка — findById(companyId, shipmentId) гарантирует только то,
// что сама отгрузка принадлежит компании, но не то, что её origin/
// destination/SKU действительно её склады/SKU. Это защищает от отгрузок,
// заведённых до исправления createShipment, с чужими ссылками
// (docs/GOS-PARTY-V1-AUDIT.md, раздел 14.3). Проверка всего набора идёт до
// цикла transferStock — при отказе на последней позиции ни одна из
// предыдущих не будет перемещена.
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

  await assertWarehouseOwnership(deps.warehouses, input.companyId, shipment.originWarehouseId);
  await assertWarehouseOwnership(deps.warehouses, input.companyId, shipment.destinationWarehouseId);
  for (const item of shipment.items) {
    await assertProductVariantOwnership(deps.productVariants, input.companyId, item.productVariantId);
  }

  for (const item of shipment.items) {
    await transferStock(
      { stock: deps.stock, warehouses: deps.warehouses, productVariants: deps.productVariants },
      {
        companyId: input.companyId,
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
