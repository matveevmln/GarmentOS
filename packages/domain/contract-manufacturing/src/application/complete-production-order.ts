import { DomainError } from "../domain/errors";
import { assertCanComplete, type ProductionOrder } from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface CompleteProductionOrderInput {
  companyId: string;
  productionOrderId: string;
}

export interface CompleteProductionOrderDeps {
  productionOrders: ProductionOrderRepository;
}

// Завершение партии (ПРОМПТ №10.1/10.2, владелец проекта, 2026-09-15) —
// отдельное явное действие пользователя после приёмки, независимое от ОТК.
// Намеренно НЕ проверяет наличие production_order_qc_results: ОТК не всегда
// обязательно (не для каждой партии есть смысл), и предупреждение об
// отсутствии ОТК — забота вызывающего кода (apps/api), а не доменный
// инвариант — тот же принцип "предупреждать, не блокировать", что уже
// применяется к нехватке материала при вводе факта кроя.
export async function completeProductionOrder(
  deps: CompleteProductionOrderDeps,
  input: CompleteProductionOrderInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(
      `Заказ пошива ${input.productionOrderId} не найден в этой компании`,
      "PRODUCTION_ORDER_NOT_FOUND",
    );
  }
  assertCanComplete(order.status);

  return deps.productionOrders.updateStatus(order.id, "completed");
}
