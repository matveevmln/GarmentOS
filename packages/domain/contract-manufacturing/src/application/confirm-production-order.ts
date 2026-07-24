import { DomainError } from "../domain/errors";
import { assertCanConfirm, type ProductionOrder } from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface ConfirmProductionOrderInput {
  companyId: string;
  productionOrderId: string;
}

export interface ConfirmProductionOrderDeps {
  productionOrders: ProductionOrderRepository;
}

// Подтверждение черновика — заказ считается размещённым у цеха
// (status: draft -> placed). Человек (или AI после one-tap-подтверждения)
// выполняет этот шаг поверх черновика, созданного createProductionOrderDraft.
export async function confirmProductionOrder(
  deps: ConfirmProductionOrderDeps,
  input: ConfirmProductionOrderInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(
      `Заказ пошива ${input.productionOrderId} не найден в этой компании`,
      "PRODUCTION_ORDER_NOT_FOUND",
    );
  }
  assertCanConfirm(order.status);

  return deps.productionOrders.updateStatus(order.id, "placed");
}
