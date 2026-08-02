import { DomainError } from "../domain/errors";
import { assertCanReceive, type ProductionOrder } from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface ReceiveProductionOrderInput {
  companyId: string;
  productionOrderId: string;
}

export interface ReceiveProductionOrderDeps {
  productionOrders: ProductionOrderRepository;
}

// Приёмка партии от цеха на наш склад (Итерация 10) — статус
// ready_for_pickup -> received. Фактическое зачисление на склад по каждому
// SKU (variants) — ответственность вызывающей стороны (apps/api), этот use
// case только переводит статус заказа, тот же принцип разделения границ, что
// и у receivePurchaseOrder в @garmentos/domain-procurement.
export async function receiveProductionOrder(
  deps: ReceiveProductionOrderDeps,
  input: ReceiveProductionOrderInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(
      `Заказ пошива ${input.productionOrderId} не найден в этой компании`,
      "PRODUCTION_ORDER_NOT_FOUND",
    );
  }
  assertCanReceive(order.status);

  return deps.productionOrders.markReceived(order.id);
}
