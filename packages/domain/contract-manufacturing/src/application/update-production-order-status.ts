import { DomainError } from "../domain/errors";
import { assertCanUpdateStatusFromWorkshop, type ProductionOrder } from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface UpdateProductionOrderStatusInput {
  companyId: string;
  productionOrderId: string;
  status: "in_progress" | "ready_for_pickup";
}

export interface UpdateProductionOrderStatusDeps {
  productionOrders: ProductionOrderRepository;
}

// REST-путь смены статуса (владелец проекта, 2026-09-05 — P0-1) — тот же
// инвариант перехода, что и у Telegram-пути (assertCanUpdateStatusFromWorkshop),
// но заказ адресуется явным id, а не «последним активным заказом цеха»:
// updateProductionOrderStatusFromWorkshop сознательно не переиспользуется здесь
// как обёртка целиком — цех может вести несколько заказов одновременно, и вызов
// по конкретному id не должен случайно затронуть другой, более свежий заказ
// того же цеха.
export async function updateProductionOrderStatus(
  deps: UpdateProductionOrderStatusDeps,
  input: UpdateProductionOrderStatusInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(`Заказ пошива ${input.productionOrderId} не найден`, "PRODUCTION_ORDER_NOT_FOUND");
  }
  assertCanUpdateStatusFromWorkshop(order.status, input.status);

  return deps.productionOrders.updateStatus(order.id, input.status);
}
