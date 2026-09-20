import { DomainError } from "../domain/errors";
import { assertCanRollbackStatus, type ProductionOrder, type ProductionOrderStatus } from "../domain/production-order";
import type { ProductionOrderRepository, QcResultLookupPort } from "./ports";

export interface RollbackProductionOrderStatusInput {
  companyId: string;
  productionOrderId: string;
  reason: string;
}

export interface RollbackProductionOrderStatusDeps {
  productionOrders: ProductionOrderRepository;
  qcResults: QcResultLookupPort;
}

export interface RollbackProductionOrderStatusResult {
  order: ProductionOrder;
  fromStatus: ProductionOrderStatus;
  toStatus: ProductionOrderStatus;
}

// Контролируемый rollback (ПРОМПТ №2.1, раздел C / ПРОМПТ №3, раздел 9) —
// узкий корректирующий механизм, не общий setStatus. reason обязателен на
// уровне DTO (shared-types), не только здесь — но проверяется и в домене,
// потому что use case не должен полагаться на то, что вызывающий код уже
// всё проверил.
export async function rollbackProductionOrderStatus(
  deps: RollbackProductionOrderStatusDeps,
  input: RollbackProductionOrderStatusInput,
): Promise<RollbackProductionOrderStatusResult> {
  if (!input.reason.trim()) {
    throw new DomainError("Для отката статуса обязательно нужно указать причину", "PRODUCTION_ORDER_ROLLBACK_REASON_REQUIRED");
  }

  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(`Заказ пошива ${input.productionOrderId} не найден`, "PRODUCTION_ORDER_NOT_FOUND");
  }

  const hasReceivedFacts = order.variants.some((variant) => variant.receivedQuantity !== null);
  const hasQcResult = await deps.qcResults.hasResultForOrder(input.companyId, order.id);

  const toStatus = assertCanRollbackStatus(order.status, hasReceivedFacts, hasQcResult);
  const updated = await deps.productionOrders.updateStatus(order.id, toStatus);

  return { order: updated, fromStatus: order.status, toStatus };
}
