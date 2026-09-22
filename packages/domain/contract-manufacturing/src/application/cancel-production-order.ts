import { DomainError } from "../domain/errors";
import { assertCanCancel, type ProductionOrder, type ProductionOrderStatus } from "../domain/production-order";
import type { ProductionOrderRepository, QcResultLookupPort } from "./ports";

export interface CancelProductionOrderInput {
  companyId: string;
  productionOrderId: string;
  reason: string;
}

export interface CancelProductionOrderDeps {
  productionOrders: ProductionOrderRepository;
  qcResults: QcResultLookupPort;
}

export interface CancelProductionOrderResult {
  order: ProductionOrder;
  fromStatus: ProductionOrderStatus;
}

// Отмена заказа пошива (владелец проекта, 2026-09-22) — та же дисциплина,
// что и у rollbackProductionOrderStatus: reason обязателен и здесь тоже
// (не только на уровне DTO в shared-types), use case не полагается на то,
// что вызывающий код уже всё проверил. Каскадная отмена связанных сущностей
// (спецификация/раскройные задания) — забота вызывающего слоя (см.
// ProductionOrderOrchestrationService.cancelProductionOrder в apps/api):
// этот use case отвечает только за сам статус заказа и его guard.
export async function cancelProductionOrder(
  deps: CancelProductionOrderDeps,
  input: CancelProductionOrderInput,
): Promise<CancelProductionOrderResult> {
  if (!input.reason.trim()) {
    throw new DomainError("Для отмены заказа обязательно нужно указать причину", "PRODUCTION_ORDER_CANCEL_REASON_REQUIRED");
  }

  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(`Заказ пошива ${input.productionOrderId} не найден`, "PRODUCTION_ORDER_NOT_FOUND");
  }

  const hasReceivedFacts = order.variants.some((variant) => variant.receivedQuantity !== null);
  const hasQcResult = await deps.qcResults.hasResultForOrder(input.companyId, order.id);

  assertCanCancel(order.status, hasReceivedFacts, hasQcResult);
  const updated = await deps.productionOrders.updateStatus(order.id, "cancelled");

  return { order: updated, fromStatus: order.status };
}
