import { DomainError } from "../domain/errors";
import { assertCanReceive, type PurchaseOrder } from "../domain/purchase-order";
import type { PurchaseOrderRepository } from "./ports";

export interface ReceivePurchaseOrderInput {
  companyId: string;
  purchaseOrderId: string;
}

export interface ReceivePurchaseOrderDeps {
  purchaseOrders: PurchaseOrderRepository;
}

// Приёмка закупки — статус sent/partially_received -> received (владелец
// проекта, 2026-08-02). Само оприходование материала на склад (увеличение
// остатка) не входит в этот use case — Procurement не зависит от Warehouse
// (та же граница, что BomApprovalPort в contract-manufacturing); композиция
// выполняется в apps/api (ProcurementService.receivePurchaseOrder), которая
// вызывает уже существующий WarehouseService после смены статуса здесь.
// MVP-упрощение: приёмка только "всё и сразу" (полное количество каждой
// позиции, как заказано) — частичная приёмка по строкам не моделируется, пока
// не понадобится.
export async function receivePurchaseOrder(
  deps: ReceivePurchaseOrderDeps,
  input: ReceivePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const order = await deps.purchaseOrders.findById(input.companyId, input.purchaseOrderId);
  if (!order) {
    throw new DomainError(`Закупка ${input.purchaseOrderId} не найдена в этой компании`, "PURCHASE_ORDER_NOT_FOUND");
  }
  assertCanReceive(order.status);

  return deps.purchaseOrders.updateStatus(order.id, "received");
}
